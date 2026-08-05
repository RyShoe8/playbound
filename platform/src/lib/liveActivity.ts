/**
 * Shared live-activity snapshots for public UI.
 *
 * Numbers are computed once and cached globally for 15 minutes so every visitor
 * sees the same snapshot and pages avoid per-request master-server / Mongo fan-out.
 */

import { unstable_cache } from "next/cache";
import { listGames } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { listPublicEditionsForGame } from "@/lib/editions";
import { listServersForGame } from "@/lib/servers/registry";
import dbConnect from "@/lib/db";
import TelemetryEvent from "@/lib/models/TelemetryEvent";

const CACHE_SECONDS = 900;
const ACTIVE_WINDOW_MS = 20 * 60 * 1000;

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
  const [games, mods] = await Promise.all([listGames(), listMods()]);
  const multiplayer = games.filter((g) => g.launchMethods.includes("server"));

  const [settled, platformPlayers, platformByGame, editionLists] = await Promise.all([
    Promise.allSettled(multiplayer.map(async (g) => multiplayerForGame(g.slug))),
    countActivePlatformPlayers(),
    countActivePlatformPlayersByGame(),
    Promise.all(games.map((g) => listPublicEditionsForGame(g))),
  ]);

  const mpBySlug = new Map<string, number>();
  let multiplayerPlayers = 0;
  multiplayer.forEach((g, i) => {
    const r = settled[i];
    if (r?.status === "fulfilled") {
      mpBySlug.set(g.slug, r.value.players);
      multiplayerPlayers += r.value.players;
    }
  });

  const editionCount = editionLists.reduce((sum, list) => sum + list.length, 0);

  const mostPopular = [...games]
    .map((g) => ({
      slug: g.slug,
      title: g.title,
      playingNow: (mpBySlug.get(g.slug) ?? 0) + (platformByGame.get(g.slug) ?? 0),
    }))
    .sort((a, b) => b.playingNow - a.playingNow || a.title.localeCompare(b.title))
    .slice(0, 3);

  const asOf = new Date().toISOString();

  return {
    gameCount: games.length,
    modCount: mods.length,
    editionCount,
    multiplayerPlayers,
    platformPlayers,
    playingNow: multiplayerPlayers + platformPlayers,
    mostPopular,
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
  const [mp, platformPlayers, playersThisMonth, installs] = await Promise.all([
    multiplayerForGame(slug),
    countActivePlatformPlayers({ gameSlug: slug }),
    countPlayersThisMonth({ gameSlug: slug }),
    countGameInstalls(slug),
  ]);
  const asOf = new Date().toISOString();
  return {
    multiplayerPlayers: mp.players,
    platformPlayers,
    playingNow: mp.players + platformPlayers,
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
  const [platformPlayers, playersThisMonth] = await Promise.all([
    countActivePlatformPlayers({ gameSlug, editionSlug }),
    countPlayersThisMonth({ gameSlug, editionSlug }),
  ]);
  const asOf = new Date().toISOString();
  return {
    multiplayerPlayers: 0,
    platformPlayers,
    playingNow: platformPlayers,
    playersThisMonth,
    serverCount: 0,
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

/** Catalog-wide snapshot (homepage). Shared for 15 minutes. */
export function getCatalogLiveStats(): Promise<CatalogLiveStats> {
  return unstable_cache(computeCatalogLiveStats, ["live-activity-catalog-v2"], {
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
