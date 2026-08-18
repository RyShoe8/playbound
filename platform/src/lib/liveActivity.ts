/**
 * Shared live-activity snapshots for public UI.
 *
 * Numbers are computed once and cached globally for 15 minutes so every visitor
 * sees the same snapshot and pages avoid per-request master-server / Mongo fan-out.
 */

import { unstable_cache } from "next/cache";
import { listGames } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { editions as seedEditions } from "@/lib/data/editions";
import { hasServerProvider, listServersForGame } from "@/lib/servers/registry";
import { fetchHoloCurePlayers } from "@/lib/servers/providers/steam-concurrent";
import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import EditionModel from "@/lib/models/Edition";

const EXTERNAL_CONCURRENT_PROVIDERS: Record<string, () => Promise<number>> = {
  holocure: async () => {
    try {
      const servers = await fetchHoloCurePlayers();
      return servers.reduce((sum, s) => sum + (Number(s.players) || 0), 0);
    } catch {
      return 0;
    }
  },
};

const CACHE_SECONDS = 900;
const ACTIVE_WINDOW_MS = 20 * 60 * 1000;
/**
 * Cap per-game master-server polls so cold catalog stats finish under
 * launcher/API budgets.
 *
 * EverQuest used to get 12s here because its login-server polls are slow. A
 * fan-out finishes with its slowest member, so that one exception set the floor
 * for the whole catalog aggregate: every fifteen minutes, when the cache
 * expired, whoever loaded the homepage first waited up to twelve seconds for a
 * number that is the sum of forty games. One game contributing zero on a slow
 * poll is a rounding error in that sum. A twelve-second homepage is not.
 */
const MULTIPLAYER_FANOUT_MS = 6000;

export type CatalogPopularGame = {
  slug: string;
  title: string;
  playingNow: number;
};

export type CatalogLiveStats = {
  gameCount: number;
  modCount: number;
  editionCount: number;
  playingNow: number;
  multiplayerPlayers: number;
  platformPlayers: number;
  mostPopular: CatalogPopularGame[];
  /** Per-game playing-now for client-side compatibility scoping. */
  byGame: CatalogPopularGame[];
  /** Reachable (non-hidden, non-archived) edition counts keyed by game slug. */
  editionCountBySlug: Record<string, number>;
  /** Card-view mods keyed by base game slug, for Discover-mode scoping. */
  modCountBySlug: Record<string, number>;
  asOf: string;
};

export type EntityLiveStats = {
  playingNow: number;
  multiplayerPlayers: number;
  platformPlayers: number;
  playersThisMonth: number;
  serverCount: number;
  installsThisMonth: number;
  installsAllTime: number | null;
  asOf: string;
};

type Scope = {
  gameSlug?: string;
  editionSlug?: string;
  modSlug?: string;
};

function propertyMatch(scope: Scope): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (scope.gameSlug) props["properties.gameSlug"] = scope.gameSlug;
  if (scope.editionSlug) props["properties.editionSlug"] = scope.editionSlug;
  if (scope.modSlug) props["properties.modSlug"] = scope.modSlug;
  return props;
}

async function multiplayerForGame(slug: string): Promise<{ players: number; servers: number }> {
  try {
    const result = await listServersForGame(slug);
    const servers = result.servers ?? [];
    return {
      players: servers.reduce((sum, s) => sum + (Number(s.players) || 0), 0),
      servers: servers.length,
    };
  } catch {
    return { players: 0, servers: 0 };
  }
}

/** Sum master-server rows tagged with a specific edition slug as gameType. */
async function multiplayerForEdition(
  gameSlug: string,
  editionSlug: string
): Promise<{ players: number; servers: number }> {
  try {
    const result = await listServersForGame(gameSlug);
    const servers = (result.servers ?? []).filter((s) => s.gameType === editionSlug);
    return {
      players: servers.reduce((sum, s) => sum + (Number(s.players) || 0), 0),
      servers: servers.length,
    };
  } catch {
    return { players: 0, servers: 0 };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      }
    );
  });
}

/**
 * Reachable edition counts per game — one aggregate instead of N round-trips.
 *
 * Matches what a visitor can actually open, which is what the editions API
 * serves: anything not hidden, so public and unlisted both count. Matching only
 * "public" undercounted badly — all four Star Wars Galaxies editions are
 * unlisted, so the game contributed nothing to a total the site was
 * simultaneously showing all four of.
 *
 * Archived editions are excluded. They were counted before, which pulled the
 * number the other way and hid how far short it fell.
 */
async function publicEditionCountsByGame(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of seedEditions) {
    if ((s.visibility ?? "public") !== "hidden" && s.status !== "archived") {
      out[s.gameSlug] = (out[s.gameSlug] || 0) + 1;
    }
  }
  try {
    await dbConnect();
    const rows = await EditionModel.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          visibility: { $ne: "hidden" },
          status: { $ne: "archived" },
        },
      },
      { $group: { _id: "$gameSlug", count: { $sum: 1 } } },
    ]);
    for (const row of rows) out[row._id] = row.count;
  } catch (err) {
    console.error("[liveActivity] edition counts failed:", err);
  }
  return out;
}

async function countActivePlatformPlayers(scope: Scope = {}): Promise<number> {
  await dbConnect();
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const prop = propertyMatch(scope);

  const starts = await TelemetryEvent.find({
    event: "session_started",
    createdAt: { $gte: since },
    sessionId: { $nin: [null, ""] },
    ...prop,
  })
    .select("sessionId createdAt")
    .lean();

  const activeSessions = new Set<string>();
  if (starts.length) {
    const sessionIds = [
      ...new Set(starts.map((s) => s.sessionId).filter((id): id is string => Boolean(id))),
    ];
    const ends = await TelemetryEvent.find({
      event: "session_ended",
      sessionId: { $in: sessionIds },
      createdAt: { $gte: since },
    })
      .select("sessionId createdAt")
      .lean();

    const latestEnd = new Map<string, Date>();
    for (const e of ends) {
      if (!e.sessionId) continue;
      const prev = latestEnd.get(e.sessionId);
      if (!prev || e.createdAt > prev) latestEnd.set(e.sessionId, e.createdAt);
    }

    for (const s of starts) {
      if (!s.sessionId) continue;
      const endAt = latestEnd.get(s.sessionId);
      if (!endAt || endAt < s.createdAt) activeSessions.add(s.sessionId);
    }
  }

  // Launcher launches that never attached a sessionId — count distinct identities
  // that started in the window and have no matching finish/end in the window.
  const looseStarts = await TelemetryEvent.find({
    event: "game_started",
    createdAt: { $gte: since },
    $or: [{ sessionId: null }, { sessionId: "" }, { sessionId: { $exists: false } }],
    ...prop,
  })
    .select("userId anonymousId")
    .lean();

  const candidateIds = new Set<string>();
  for (const s of looseStarts) {
    const id = s.userId || s.anonymousId;
    if (id) candidateIds.add(id);
  }

  if (candidateIds.size) {
    const closed = await TelemetryEvent.find({
      event: { $in: ["session_ended", "game_finished"] },
      createdAt: { $gte: since },
      $or: [
        { userId: { $in: [...candidateIds] } },
        { anonymousId: { $in: [...candidateIds] } },
      ],
      ...prop,
    })
      .select("userId anonymousId")
      .lean();
    const closedIds = new Set<string>();
    for (const c of closed) {
      if (c.userId) closedIds.add(c.userId);
      if (c.anonymousId) closedIds.add(c.anonymousId);
    }
    for (const id of closedIds) candidateIds.delete(id);
  }

  return activeSessions.size + candidateIds.size;
}

/** Active platform players in the window, keyed by properties.gameSlug. */
async function countActivePlatformPlayersByGame(): Promise<Map<string, number>> {
  await dbConnect();
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const counts = new Map<string, number>();

  const bump = (slug: string, n = 1) => {
    counts.set(slug, (counts.get(slug) ?? 0) + n);
  };

  const starts = await TelemetryEvent.find({
    event: "session_started",
    createdAt: { $gte: since },
    sessionId: { $nin: [null, ""] },
    "properties.gameSlug": { $nin: [null, ""] },
  })
    .select("sessionId createdAt properties.gameSlug")
    .lean();

  if (starts.length) {
    const sessionIds = [
      ...new Set(starts.map((s) => s.sessionId).filter((id): id is string => Boolean(id))),
    ];
    const ends = await TelemetryEvent.find({
      event: "session_ended",
      sessionId: { $in: sessionIds },
      createdAt: { $gte: since },
    })
      .select("sessionId createdAt")
      .lean();

    const latestEnd = new Map<string, Date>();
    for (const e of ends) {
      if (!e.sessionId) continue;
      const prev = latestEnd.get(e.sessionId);
      if (!prev || e.createdAt > prev) latestEnd.set(e.sessionId, e.createdAt);
    }

    const activeByGame = new Map<string, Set<string>>();
    for (const s of starts) {
      if (!s.sessionId) continue;
      const slug = String((s.properties as { gameSlug?: unknown })?.gameSlug ?? "");
      if (!slug) continue;
      const endAt = latestEnd.get(s.sessionId);
      if (endAt && endAt >= s.createdAt) continue;
      let set = activeByGame.get(slug);
      if (!set) {
        set = new Set();
        activeByGame.set(slug, set);
      }
      set.add(s.sessionId);
    }
    for (const [slug, sessions] of activeByGame) bump(slug, sessions.size);
  }

  const looseStarts = await TelemetryEvent.find({
    event: "game_started",
    createdAt: { $gte: since },
    $or: [{ sessionId: null }, { sessionId: "" }, { sessionId: { $exists: false } }],
    "properties.gameSlug": { $nin: [null, ""] },
  })
    .select("userId anonymousId properties.gameSlug")
    .lean();

  const candidatesByGame = new Map<string, Set<string>>();
  const allCandidateIds = new Set<string>();
  for (const s of looseStarts) {
    const slug = String((s.properties as { gameSlug?: unknown })?.gameSlug ?? "");
    const id = s.userId || s.anonymousId;
    if (!slug || !id) continue;
    let set = candidatesByGame.get(slug);
    if (!set) {
      set = new Set();
      candidatesByGame.set(slug, set);
    }
    set.add(id);
    allCandidateIds.add(id);
  }

  if (allCandidateIds.size) {
    const closed = await TelemetryEvent.find({
      event: { $in: ["session_ended", "game_finished"] },
      createdAt: { $gte: since },
      $or: [
        { userId: { $in: [...allCandidateIds] } },
        { anonymousId: { $in: [...allCandidateIds] } },
      ],
      "properties.gameSlug": { $nin: [null, ""] },
    })
      .select("userId anonymousId properties.gameSlug")
      .lean();

    const closedByGame = new Map<string, Set<string>>();
    for (const c of closed) {
      const slug = String((c.properties as { gameSlug?: unknown })?.gameSlug ?? "");
      if (!slug) continue;
      let set = closedByGame.get(slug);
      if (!set) {
        set = new Set();
        closedByGame.set(slug, set);
      }
      if (c.userId) set.add(c.userId);
      if (c.anonymousId) set.add(c.anonymousId);
    }

    for (const [slug, ids] of candidatesByGame) {
      const closedIds = closedByGame.get(slug);
      if (closedIds) {
        for (const id of closedIds) ids.delete(id);
      }
      if (ids.size) bump(slug, ids.size);
    }
  }

  return counts;
}

async function countPlayersThisMonth(scope: Scope = {}): Promise<number> {
  await dbConnect();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const prop = propertyMatch(scope);

  const rows = await TelemetryEvent.find({
    event: { $in: ["game_started", "session_started"] },
    createdAt: { $gte: since },
    ...prop,
  })
    .select("userId anonymousId")
    .lean();

  const ids = new Set<string>();
  for (const r of rows) {
    const id = r.userId || r.anonymousId;
    if (id) ids.add(id);
  }
  return ids.size;
}

async function countModInstalls(modSlug: string): Promise<{ month: number; allTime: number }> {
  await dbConnect();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const base = { event: "mod_installed", "properties.modSlug": modSlug };
  const [month, allTime] = await Promise.all([
    TelemetryEvent.countDocuments({ ...base, createdAt: { $gte: since } }),
    TelemetryEvent.countDocuments(base),
  ]);
  return { month, allTime };
}

async function computeCatalogLiveStats(): Promise<CatalogLiveStats> {
  const [games, mods] = await Promise.all([listGames(), listMods({ view: "card" })]);
  const multiplayer = games.filter(
    (g) => g.launchMethods.includes("server") || hasServerProvider(g.slug)
  );

  const [settled, platformPlayers, platformByGame, editionCountBySlug, externalEntries] = await Promise.all([
    Promise.allSettled(
      multiplayer.map((g) =>
        // One budget for everyone; see MULTIPLAYER_FANOUT_MS for why.
        withTimeout(multiplayerForGame(g.slug), MULTIPLAYER_FANOUT_MS, {
          players: 0,
          servers: 0,
        })
      )
    ),
    countActivePlatformPlayers(),
    countActivePlatformPlayersByGame(),
    publicEditionCountsByGame(),
    Promise.all(
      Object.entries(EXTERNAL_CONCURRENT_PROVIDERS).map(async ([slug, fn]) => {
        const count = await withTimeout(fn(), MULTIPLAYER_FANOUT_MS, 0);
        return [slug, count] as const;
      })
    ),
  ]);

  const externalBySlug = new Map<string, number>(externalEntries);
  let externalTotal = 0;
  for (const count of externalBySlug.values()) {
    externalTotal += count;
  }

  const mpBySlug = new Map<string, number>();
  let multiplayerPlayers = 0;
  multiplayer.forEach((g, i) => {
    const r = settled[i];
    if (r?.status === "fulfilled") {
      mpBySlug.set(g.slug, r.value.players);
      multiplayerPlayers += r.value.players;
    }
  });

  let editionCount = 0;
  for (const g of games) {
    editionCount += Math.max(1, Number(editionCountBySlug[g.slug]) || 0);
  }

  const modCountBySlug: Record<string, number> = {};
  for (const mod of mods) {
    const base = mod.baseGameSlug;
    if (!base) continue;
    modCountBySlug[base] = (modCountBySlug[base] || 0) + 1;
  }

  const byGame = [...games]
    .map((g) => ({
      slug: g.slug,
      title: g.title,
      playingNow:
        (mpBySlug.get(g.slug) ?? 0) +
        (platformByGame.get(g.slug) ?? 0) +
        (externalBySlug.get(g.slug) ?? 0),
    }))
    .sort((a, b) => b.playingNow - a.playingNow || a.title.localeCompare(b.title));

  const mostPopular = byGame.slice(0, 3);

  const asOf = new Date().toISOString();

  return {
    gameCount: games.length,
    modCount: mods.length,
    editionCount,
    multiplayerPlayers,
    platformPlayers: platformPlayers + externalTotal,
    playingNow: multiplayerPlayers + platformPlayers + externalTotal,
    mostPopular,
    byGame,
    editionCountBySlug,
    modCountBySlug,
    asOf,
  };
}

async function countGameInstalls(gameSlug: string): Promise<{ month: number; allTime: number }> {
  await dbConnect();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const base = { event: "game_installed", "properties.gameSlug": gameSlug };
  const [month, allTime] = await Promise.all([
    TelemetryEvent.countDocuments({ ...base, createdAt: { $gte: since } }),
    TelemetryEvent.countDocuments(base),
  ]);
  return { month, allTime };
}

async function computeGameLiveStats(slug: string): Promise<EntityLiveStats> {
  const extFn = EXTERNAL_CONCURRENT_PROVIDERS[slug];
  const [mp, platformPlayers, playersThisMonth, installs, externalPlayers] = await Promise.all([
    multiplayerForGame(slug),
    countActivePlatformPlayers({ gameSlug: slug }),
    countPlayersThisMonth({ gameSlug: slug }),
    countGameInstalls(slug),
    extFn ? withTimeout(extFn(), MULTIPLAYER_FANOUT_MS, 0) : Promise.resolve(0),
  ]);
  const asOf = new Date().toISOString();
  const totalLive = mp.players + platformPlayers + externalPlayers;
  return {
    multiplayerPlayers: mp.players,
    platformPlayers: platformPlayers + externalPlayers,
    playingNow: totalLive,
    playersThisMonth,
    serverCount: mp.servers,
    installsThisMonth: installs.month,
    installsAllTime: installs.allTime,
    asOf,
  };
}

async function computeEditionLiveStats(
  gameSlug: string,
  editionSlug: string
): Promise<EntityLiveStats> {
  const extFn = EXTERNAL_CONCURRENT_PROVIDERS[gameSlug];
  const [platformPlayers, playersThisMonth, mp, externalPlayers] = await Promise.all([
    countActivePlatformPlayers({ gameSlug, editionSlug }),
    countPlayersThisMonth({ gameSlug, editionSlug }),
    multiplayerForEdition(gameSlug, editionSlug),
    extFn ? withTimeout(extFn(), MULTIPLAYER_FANOUT_MS, 0) : Promise.resolve(0),
  ]);
  const asOf = new Date().toISOString();
  const totalLive = mp.players + platformPlayers + externalPlayers;
  return {
    multiplayerPlayers: mp.players,
    platformPlayers: platformPlayers + externalPlayers,
    playingNow: totalLive,
    playersThisMonth,
    serverCount: mp.servers,
    installsThisMonth: 0,
    installsAllTime: null,
    asOf,
  };
}

async function computeModLiveStats(modSlug: string): Promise<EntityLiveStats> {
  const [platformPlayers, playersThisMonth, installs] = await Promise.all([
    countActivePlatformPlayers({ modSlug }),
    countPlayersThisMonth({ modSlug }),
    countModInstalls(modSlug),
  ]);
  // Monthly "players" for mods: prefer session starters; fall back to installers.
  const month = Math.max(playersThisMonth, installs.month);
  const asOf = new Date().toISOString();
  return {
    multiplayerPlayers: 0,
    platformPlayers,
    playingNow: platformPlayers,
    playersThisMonth: month,
    serverCount: 0,
    installsThisMonth: installs.month,
    installsAllTime: installs.allTime,
    asOf,
  };
}

export function playingNowBySlug(stats: CatalogLiveStats): Record<string, number> {
  const map: Record<string, number> = {};
  for (const game of stats.byGame) map[game.slug] = game.playingNow;
  return map;
}

/** Catalog-wide snapshot (homepage). Shared for 15 minutes. */
export function getCatalogLiveStats(): Promise<CatalogLiveStats> {
  return unstable_cache(computeCatalogLiveStats, ["live-activity-catalog-v8"], {
    revalidate: CACHE_SECONDS,
    tags: ["live-activity"],
  })();
}

/** Per-game snapshot. Shared for 15 minutes. */
export function getGameLiveStats(slug: string): Promise<EntityLiveStats> {
  return unstable_cache(() => computeGameLiveStats(slug), ["live-activity-game", slug], {
    revalidate: CACHE_SECONDS,
    tags: ["live-activity", `live-activity-game-${slug}`],
  })();
}

/** Per-edition snapshot. Shared for 15 minutes. */
export function getEditionLiveStats(
  gameSlug: string,
  editionSlug: string
): Promise<EntityLiveStats> {
  return unstable_cache(
    () => computeEditionLiveStats(gameSlug, editionSlug),
    ["live-activity-edition", gameSlug, editionSlug],
    {
      revalidate: CACHE_SECONDS,
      tags: ["live-activity", `live-activity-edition-${gameSlug}-${editionSlug}`],
    }
  )();
}

/** Per-mod snapshot. Shared for 15 minutes. */
export function getModLiveStats(modSlug: string): Promise<EntityLiveStats> {
  return unstable_cache(() => computeModLiveStats(modSlug), ["live-activity-mod", modSlug], {
    revalidate: CACHE_SECONDS,
    tags: ["live-activity", `live-activity-mod-${modSlug}`],
  })();
}

export type TopPlayer = {
  id: string;
  username: string;
  image?: string;
  durationMs: number;
};

async function computeGameTopPlayers(gameSlug: string, limit = 3): Promise<TopPlayer[]> {
  await dbConnect();
  
  const topUsers = await TelemetryEvent.aggregate([
    {
      $match: {
        event: "game_ended",
        "properties.gameSlug": gameSlug,
        userId: { $ne: null }
      }
    },
    {
      $group: {
        _id: "$userId",
        totalDurationMs: { $sum: "$properties.durationMs" }
      }
    },
    { $sort: { totalDurationMs: -1 } },
    { $limit: limit }
  ]);

  if (topUsers.length === 0) return [];

  interface TopUserAggregate {
    _id: { toString(): string };
    totalDurationMs: number;
  }
  interface UserSummaryDoc {
    _id: { toString(): string };
    username: string;
    image?: string | null;
  }

  const aggregates = topUsers as unknown as TopUserAggregate[];
  const User = (await import("@/lib/models/User")).default;
  const userIds = aggregates.map((u) => u._id);
  const users = (await User.find({ _id: { $in: userIds } }).select("username image").lean()) as unknown as UserSummaryDoc[];
  
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));
  
  return aggregates
    .map((u) => {
      const user = userMap.get(u._id.toString());
      if (!user) return null;
      return {
        id: u._id.toString(),
        username: user.username,
        image: user.image ?? undefined,
        durationMs: u.totalDurationMs
      };
    })
    .filter(Boolean) as TopPlayer[];
}

export function getGameTopPlayers(gameSlug: string, limit = 3): Promise<TopPlayer[]> {
  return unstable_cache(() => computeGameTopPlayers(gameSlug, limit), ["live-activity-top-players", gameSlug, String(limit)], {
    revalidate: CACHE_SECONDS,
    tags: ["live-activity", `live-activity-game-${gameSlug}`],
  })();
}
