import { unstable_cache, revalidateTag } from "next/cache";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { listGames } from "@/lib/catalog";
import { listDiscoverableGames } from "@/lib/access/discover";
import { gameRequiresPurchase } from "@/lib/access/resolver";
import { getLookingToPartyCounts } from "@/lib/playTogether/lookingToParty";
import { getGameLiveStats } from "@/lib/liveActivity";
import { supportsMultiplayer, supportsLauncherParty } from "@/lib/multiplayer/support";

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

const CACHE_SECONDS = 60;

export async function computeMultiplayerActivitySnapshot(): Promise<MultiplayerActivityResponse> {
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
              status: { $in: ["waiting", "preparing", "ready", "playing"] },
              gameSlug: { $nin: [null, ""] },
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
  const multiplayerGames = allGames.filter(
    (g) => supportsMultiplayer(g) && (discoverableSlugs.size === 0 || discoverableSlugs.has(g.slug))
  );

  // Load stats for multiplayer games
  const statsResults = await Promise.all(
    multiplayerGames.map(async (g) => {
      try {
        const stats = await getGameLiveStats(g.slug);
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
      supportsDirectJoin: game.launchMethods.includes("server"),
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
  return unstable_cache(computeMultiplayerActivitySnapshot, ["multiplayer-activity-snapshot-v1"], {
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
