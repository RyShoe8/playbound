import { unstable_cache, revalidateTag } from "next/cache";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { listGames } from "@/lib/catalog";
import { listEditionsForGames } from "@/lib/editions";
import { listDiscoverableGames } from "@/lib/access/discover";
import { gameRequiresPurchase } from "@/lib/access/resolver";
import { getLookingToPartyCounts } from "@/lib/playTogether/lookingToParty";
import { countActivePlatformPlayersByGame } from "@/lib/liveActivity";
import { getPlayerCountForGame } from "@/lib/servers/registry";
import { listAllJoinableCommunityServers } from "@/lib/communityHosting/discovery";
import type { GameServer } from "@/lib/servers/types";
import { supportsMultiplayer, supportsLauncherParty } from "@/lib/multiplayer/support";
import { OPEN_PARTY_STATUSES } from "@/lib/playTogether/party/serialize";
import { PARTY_MAX_SIZE } from "@/lib/playTogether/types";

export type GameMultiplayerActivity = {
  gameSlug: string;
  gameTitle: string;
  coverImage?: string | null;
  heroImage?: string | null;
  tags?: string[];
  genre?: string;
  isFree?: boolean;
  openPartyCount: number;
  usersLookingCount: number;
  serversOnline: number;
  serverPlayerCount: number;
  platformPlayerCount: number;
  isMmo: boolean;
  supportsDirectJoin: boolean;
  supportsParty: boolean;
  score: number;
  updatedAt: string;
};

export type MultiplayerActivityResponse = {
  summary: {
    totalServerPlayers: number;
    totalServersOnline: number;
    totalOpenParties: number;
    totalUsersLooking: number;
  };
  games: GameMultiplayerActivity[];
  asOf: string;
};

function isMmoGame(game: { tags?: string[]; features?: string[]; genre?: string; slug?: string }): boolean {
  const haystack = [game.genre || "", ...(game.tags ?? []), ...(game.features ?? []), game.slug || ""].join(" ").toLowerCase();
  return haystack.includes("mmo") || haystack.includes("mmorpg") || haystack.includes("runescape") || haystack.includes("everquest");
}

/*
 * One slow game server provider used to hold the whole snapshot: the totals waited on
 * every provider, and a handful of master-server lookups can each take tens of seconds.
 * Each game now gets a few seconds; a provider that misses its deadline keeps its last
 * known count (carried between recomputes in this process) so the totals neither stall
 * nor flicker to zero.
 */
const PROVIDER_DEADLINE_MS = 4000;
const lastKnownCounts = new Map<string, { players: number; servers: number }>();
async function playerCountWithinDeadline(
  slug: string,
  hostedSnapshot?: readonly GameServer[]
): Promise<{ players: number; servers: number }> {
  const fresh = getPlayerCountForGame(slug, hostedSnapshot).then((counts) => {
    lastKnownCounts.set(slug, counts);
    return counts;
  });
  fresh.catch(() => {});
  const late = new Promise<{ players: number; servers: number }>((resolve) =>
    setTimeout(() => resolve(lastKnownCounts.get(slug) ?? { players: 0, servers: 0 }), PROVIDER_DEADLINE_MS)
  );
  return Promise.race([fresh, late]);
}

// Recomputing the snapshot can take half a minute, so keep it a little longer between refreshes.
const CACHE_SECONDS = 180;

async function computeMultiplayerActivitySnapshot(): Promise<MultiplayerActivityResponse> {
  let hasDb = false;
  try {
    if (process.env.MONGODB_URI && process.env.MONGODB_URI !== "[SENSITIVE]") {
      await dbConnect();
      hasDb = true;
    }
  } catch (dbErr) {
    console.warn("Multiplayer activity snapshot: DB connection failed, using offline fallback:", dbErr);
  }

  const [discoverable, allGames, ltp, openPartyRows] = await Promise.all([
    listDiscoverableGames().catch(() => []),
    listGames({ includeTesting: false }),
    hasDb
      ? getLookingToPartyCounts().catch((): {
          total: number;
          byGame: Record<string, number>;
        } => ({ total: 0, byGame: {} }))
      : Promise.resolve({ total: 0, byGame: {} as Record<string, number> }),
    hasDb
      ? Party.aggregate<{ _id: string; count: number }>([
          {
            $match: {
              visibility: "public",
              status: { $in: [...OPEN_PARTY_STATUSES] },
              gameSlug: { $nin: [null, ""] },
              $expr: { $lt: [{ $size: { $ifNull: ["$members", []] } }, { $ifNull: ["$maxSize", PARTY_MAX_SIZE] }] },
            },
          },
          {
            $group: {
              _id: "$gameSlug",
              count: { $sum: 1 },
            },
          },
        ]).catch(() => [])
      : Promise.resolve([]),
  ]);

  const openPartyMap = new Map<string, number>(
    openPartyRows.map((r) => [r._id, r.count])
  );

  // Filter to multiplayer games
  const discoverableSlugs = new Set(discoverable.map((g) => g.slug));
  const editionsByGame = await listEditionsForGames(allGames, { includeInactive: false });
  const multiplayerGames = allGames.map(g => ({ ...g, editions: editionsByGame.get(g.slug) || [] })).filter(
    (g) => supportsMultiplayer(g) && (discoverableSlugs.size === 0 || discoverableSlugs.has(g.slug))
  );

  // Load stats for multiplayer games
  // Public server counts must not depend on install-history queries succeeding.
  // Read presence once instead of launching several DB queries for every game.
  const platformByGame = hasDb ? await countActivePlatformPlayersByGame().catch(() => new Map<string, number>()) : new Map<string, number>();
  /*
   * One read of PlayBound's community servers for every game. Without it each
   * game ran its own CommunityServer query and agent call — ~60 at once per
   * recompute — which exhausted the Mongo pool (MongoWaitQueueTimeoutError)
   * and made unrelated pages fall back to seed.
   */
  const hostedSnapshot = hasDb ? await listAllJoinableCommunityServers().catch(() => undefined) : undefined;
  const statsResults = await Promise.all(
    multiplayerGames.map(async (g) => {
      try {
        const counts = await playerCountWithinDeadline(g.slug, hostedSnapshot);
        const stats = { multiplayerPlayers: counts.players, serverCount: counts.servers, platformPlayers: platformByGame.get(g.slug) ?? 0 };
        return { slug: g.slug, stats };
      } catch {
        return {
          slug: g.slug,
          stats: { playingNow: 0, multiplayerPlayers: 0, platformPlayers: 0, serverCount: 0 },
        };
      }
    })
  );

  const statsMap = new Map(statsResults.map((r) => [r.slug, r.stats]));

  let totalServerPlayers = 0;
  let totalServersOnline = 0;
  let totalOpenParties = 0;
  const totalUsersLooking = ltp.total;

  for (const count of openPartyMap.values()) {
    totalOpenParties += count;
  }
  const activities: GameMultiplayerActivity[] = multiplayerGames.map((game) => {
    const stats = statsMap.get(game.slug) || {
      playingNow: 0,
      multiplayerPlayers: 0,
      platformPlayers: 0,
      serverCount: 0,
    };
    const openCount = openPartyMap.get(game.slug) || 0;
    const lookingCount = ltp.byGame[game.slug] || 0;
    const srvPlayers = stats.multiplayerPlayers || 0;
    const srvOnline = stats.serverCount || 0;
    const isMmo = isMmoGame(game);

    totalServerPlayers += srvPlayers;
    totalServersOnline += srvOnline;

    const score =
      openCount * 50 +
      lookingCount * 25 +
      (stats.platformPlayers || 0) * 10 +
      Math.min(srvPlayers, 500) * 0.5 +
      (srvPlayers > 500 ? 50 : 0);

    return {
      gameSlug: game.slug,
      gameTitle: game.title,
      coverImage: game.coverImage || null,
      heroImage: null,
      tags: game.tags,
      genre: game.genres?.[0] || undefined,
      isFree: !gameRequiresPurchase(game.access),
      openPartyCount: openCount,
      usersLookingCount: lookingCount,
      serversOnline: srvOnline,
      serverPlayerCount: srvPlayers,
      platformPlayerCount: stats.platformPlayers || 0,
      isMmo,
      supportsDirectJoin: game.slug === "rimworld" ? game.editions.some(e => e.slug === "rimworld-together") : game.launchMethods.includes("server"),
      supportsParty: supportsLauncherParty(game),
      score,
      updatedAt: new Date().toISOString(),
    };
  });

  activities.sort((a, b) => b.score - a.score || a.gameTitle.localeCompare(b.gameTitle));

  return {
    summary: {
      totalServerPlayers,
      totalServersOnline,
      totalOpenParties,
      totalUsersLooking,
    },
    games: activities,
    asOf: new Date().toISOString(),
  };
}

export function getMultiplayerActivitySnapshot(): Promise<MultiplayerActivityResponse> {
  return unstable_cache(computeMultiplayerActivitySnapshot, ["multiplayer-activity-snapshot-v5"], {
    revalidate: CACHE_SECONDS,
    tags: ["multiplayer-activity"],
  })();
}

export function revalidateMultiplayerActivity(): void {
  try {
    revalidateTag("multiplayer-activity", { expire: 0 });
  } catch {
    /* ignore outside request lifecycle */
  }
}
