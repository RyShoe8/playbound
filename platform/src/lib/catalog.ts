import { cache } from "react";
import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import type { Game, Genre, LaunchMethod } from "@/lib/data/types";
import type { LauncherInstall } from "@/lib/launcherInstall";
import { games as seedGames } from "@/lib/data/games";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { collections, collectionsBySlug } from "@/lib/data";
import { listCollections } from "@/lib/collections";
import { listDevelopers } from "@/lib/developers";
import { searchEditions } from "@/lib/editions";
import type { Edition } from "@/lib/editionTypes";
import type { Collection, Developer } from "@/lib/data/types";
import { mongoVisibleFilter, normalizeStatus, type CatalogStatus } from "@/lib/catalogStatus";

export type { Game } from "@/lib/data/types";
// Developers are deliberately no longer re-exported here. They are database
// backed now, so reaching for the static list would silently serve only the
// nineteen seed entries and miss anything added through the admin — import
// from "@/lib/developers" instead.
export { collections, collectionsBySlug };

type LeanGame = Record<string, unknown>;

function attachLauncherInstall(game: Game, doc?: LeanGame): Game {
  const fromDoc = doc?.launcherInstall as LauncherInstall | null | undefined;
  if (fromDoc?.kind) {
    return { ...game, launcherInstall: fromDoc };
  }
  const seed = launcherInstallBySlug[game.slug];
  if (seed) return { ...game, launcherInstall: seed };
  return game;
}

function toGame(doc: LeanGame): Game {
  const status = normalizeStatus(doc);
  const base: Game = {
    slug: String(doc.slug),
    title: String(doc.title),
    tagline: String(doc.tagline),
    description: String(doc.description),
    developerSlug: String(doc.developerSlug),
    genres: (doc.genres as Genre[]) ?? [],
    tags: (doc.tags as string[]) ?? [],
    aliases: (doc.aliases as string[]) ?? [],
    license: String(doc.license),
    releaseYear: Number(doc.releaseYear),
    sizeMB: Number(doc.sizeMB),
    status,
    platforms: (doc.platforms as string[]) ?? [],
    features: (doc.features as string[]) ?? [],
    launchMethods: (doc.launchMethods as LaunchMethod[]) ?? [],
    browserPlayable: Boolean(doc.browserPlayable),
    steamDeck: Boolean(doc.steamDeck),
    website: String(doc.website),
    steamAppId: (doc.steamAppId as string) || undefined,
    androidStoreUrl: (doc.androidStoreUrl as string) || seedBySlug.get(String(doc.slug))?.androidStoreUrl,
    iosStoreUrl: (doc.iosStoreUrl as string) || seedBySlug.get(String(doc.slug))?.iosStoreUrl,
    githubRepo: (doc.githubRepo as string) || undefined,
    gameOfWeek: Boolean(doc.gameOfWeek),
    hiddenGem: Boolean(doc.hiddenGem),
    complete: Boolean(doc.complete),
    art: doc.art as Game["art"],
    coverImage: (doc.coverImage as string) || seedBySlug.get(String(doc.slug))?.coverImage,
    screenshots: (doc.screenshots as string[])?.length ? (doc.screenshots as string[]) : undefined,
    videos: (doc.videos as string[])?.length ? (doc.videos as string[]) : undefined,
    systemRequirements: doc.systemRequirements as Game["systemRequirements"],
    hardwareRequirements: (doc.hardwareRequirements as Game["hardwareRequirements"]) || null,

    // Editorial depth. Falls back to the seed entry so hand-written content
    // survives a DB import that does not yet carry these fields.
    qualityBar: (doc.qualityBar as Game["qualityBar"]) ?? seedBySlug.get(String(doc.slug))?.qualityBar,
    longDescription:
      (doc.longDescription as string) || seedBySlug.get(String(doc.slug))?.longDescription,
    whyWePickedIt:
      (doc.whyWePickedIt as string) || seedBySlug.get(String(doc.slug))?.whyWePickedIt,
    installSteps:
      (doc.installSteps as Game["installSteps"])?.length
        ? (doc.installSteps as Game["installSteps"])
        : seedBySlug.get(String(doc.slug))?.installSteps,
    faq: (doc.faq as Game["faq"])?.length
      ? (doc.faq as Game["faq"])
      : seedBySlug.get(String(doc.slug))?.faq,
    bestFor: (doc.bestFor as string[])?.length
      ? (doc.bestFor as string[])
      : seedBySlug.get(String(doc.slug))?.bestFor,
    notFor: (doc.notFor as string[])?.length
      ? (doc.notFor as string[])
      : seedBySlug.get(String(doc.slug))?.notFor,
    comparableTo: (doc.comparableTo as string[])?.length
      ? (doc.comparableTo as string[])
      : seedBySlug.get(String(doc.slug))?.comparableTo,
    updatedAt: (doc as { updatedAt?: Date }).updatedAt
      ? new Date((doc as { updatedAt: Date }).updatedAt).toISOString()
      : undefined,
    createdAt: (doc as { createdAt?: Date }).createdAt
      ? new Date((doc as { createdAt: Date }).createdAt).toISOString()
      : undefined,
    communityLinks: mapCommunityLinks(doc.communityLinks),
  };
  return attachLauncherInstall(base, doc);
}

function mapCommunityLinks(raw: unknown): Game["communityLinks"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const links = raw as {
    officialDiscord?: {
      inviteUrl?: string | null;
      serverName?: string | null;
      verified?: boolean;
      verifiedSourceUrl?: string | null;
      verifiedAt?: Date | string | null;
    };
    playboundDiscord?: {
      guildId?: string | null;
      channelId?: string | null;
      channelName?: string | null;
      inviteCode?: string | null;
      inviteUrl?: string | null;
      provisionedAt?: Date | string | null;
    };
  };
  const official = links.officialDiscord;
  const playbound = links.playboundDiscord;
  const out: NonNullable<Game["communityLinks"]> = {};
  if (official?.inviteUrl) {
    out.officialDiscord = {
      inviteUrl: official.inviteUrl,
      serverName: official.serverName || undefined,
      verified: Boolean(official.verified),
      verifiedSourceUrl: official.verifiedSourceUrl || undefined,
      verifiedAt: official.verifiedAt
        ? new Date(official.verifiedAt).toISOString()
        : undefined,
    };
  }
  if (playbound?.inviteUrl && playbound.channelName) {
    out.playboundDiscord = {
      guildId: playbound.guildId || undefined,
      channelId: playbound.channelId || undefined,
      channelName: playbound.channelName,
      inviteCode: playbound.inviteCode || undefined,
      inviteUrl: playbound.inviteUrl,
      provisionedAt: playbound.provisionedAt
        ? new Date(playbound.provisionedAt).toISOString()
        : undefined,
    };
  }
  return out.officialDiscord || out.playboundDiscord ? out : undefined;
}

/** Seed lookup, used to backfill editorial fields absent from DB documents. */
const seedBySlug = new Map(seedGames.map((g) => [g.slug, g]));

function seedGameWithInstall(g: Game): Game {
  return attachLauncherInstall(g);
}

async function fromMongo(filter: Record<string, unknown> = {}): Promise<Game[]> {
  try {
    await dbConnect();
    const docs = await CatalogGame.find(filter).sort({ title: 1 }).lean();
    return docs.map((d) => toGame(d as LeanGame));
  } catch (err) {
    console.error("[catalog] Mongo read failed, falling back to seed:", err);
    return [];
  }
}

/**
 * Published games for the public site, memoized for the lifetime of one
 * request.
 *
 * Nearly every catalog helper below is a filter over the full list, and a
 * single page routinely calls several of them (the home page alone wants the
 * game of the week, the full list and the hidden gems). Without `cache()` each
 * of those re-queried Mongo. Reading once and filtering in memory also lets us
 * drop the old countDocuments() probe, which doubled the round trips just to
 * decide whether the collection was empty — an empty result says the same
 * thing for free.
 */
const loadPublishedGames = cache(async (): Promise<Game[]> => {
  const fromDb = await fromMongo(mongoVisibleFilter({ includeTesting: false }));
  if (fromDb.length > 0) return fromDb;
  return seedGames.map(seedGameWithInstall);
});

async function loadPublishedAndTestingGames(): Promise<Game[]> {
  const fromDb = await fromMongo(mongoVisibleFilter({ includeTesting: true }));
  if (fromDb.length > 0) return fromDb;
  return seedGames.map(seedGameWithInstall);
}

/** Visible catalog. Pass `includeTesting` for admin viewers (published + testing). */
export async function listGames(opts?: { includeTesting?: boolean }): Promise<Game[]> {
  if (opts?.includeTesting) return loadPublishedAndTestingGames();
  return loadPublishedGames();
}

/** All games including drafts (admin). */
export async function listAllGames(): Promise<
  (Game & { published: boolean; status: CatalogStatus; updatedAt?: string; installCount?: number })[]
> {
  try {
    await dbConnect();
    const docs = await CatalogGame.find().sort({ updatedAt: -1 }).lean();
    if (docs.length === 0) {
      return seedGames.map((g) => ({
        ...seedGameWithInstall(g),
        published: true,
        status: "published" as const,
        installCount: 0,
      }));
    }
    return docs.map((d) => {
      const lean = d as LeanGame;
      const status = normalizeStatus(lean);
      return {
        ...toGame(lean),
        published: status === "published",
        status,
        updatedAt: (d as { updatedAt?: Date }).updatedAt?.toISOString(),
        installCount: Number((d as { installCount?: number }).installCount) || 0,
      };
    });
  } catch {
    return seedGames.map((g) => ({
      ...seedGameWithInstall(g),
      published: true,
      status: "published" as const,
      installCount: 0,
    }));
  }
}

export async function getGame(
  slug: string,
  opts?: { includeUnpublished?: boolean; includeTesting?: boolean }
): Promise<Game | undefined> {
  // Published lookups reuse the per-request catalog, so a page that already
  // listed games does not pay for a second query to resolve one of them.
  if (!opts?.includeUnpublished) {
    const catalog = opts?.includeTesting
      ? await loadPublishedAndTestingGames()
      : await loadPublishedGames();
    const found = catalog.find((g) => g.slug === slug);
    if (found) return found;
  }

  try {
    await dbConnect();
    const query: Record<string, unknown> = opts?.includeUnpublished
      ? { slug }
      : { $and: [{ slug }, mongoVisibleFilter({ includeTesting: Boolean(opts?.includeTesting) })] };

    const doc = await CatalogGame.findOne(query).lean();
    if (doc) return toGame(doc as LeanGame);
  } catch (err) {
    console.error("[catalog] getGame failed:", err);
  }

  const seed = seedGames.find((g) => g.slug === slug);
  return seed ? seedGameWithInstall(seed) : undefined;
}

/**
 * Resolve a retired slug to the game's current one.
 *
 * Returns null when the slug was never used, so callers can fall through to a
 * genuine 404 rather than redirecting on every unknown URL.
 */
export const canonicalSlugFor = cache(async (slug: string): Promise<string | null> => {
  try {
    await dbConnect();
    const doc = await CatalogGame.findOne({ previousSlugs: slug })
      .select("slug published")
      .lean();
    const found = doc as { slug?: string; published?: boolean } | null;
    if (!found?.slug || !found.published) return null;
    return found.slug;
  } catch {
    return null;
  }
});

/** Lobby credentials for Zero-K / 0 A.D. listings — never expose on public Game. */
export async function getServerLobbyAuth(
  slug: string
): Promise<{ username: string; password: string } | null> {
  try {
    await dbConnect();
    const doc = await CatalogGame.findOne({ slug }).select("serverLobbyAuth").lean();
    const auth = (doc as LeanGame | null)?.serverLobbyAuth as
      | { username?: string | null; password?: string | null }
      | null
      | undefined;
    const username = auth?.username?.trim();
    const password = auth?.password?.trim();
    if (!username || !password) return null;
    return { username, password };
  } catch (err) {
    console.error("[catalog] getServerLobbyAuth failed:", err);
    return null;
  }
}

/**
 * Resolve a game for launcher library sync.
 * Accepts published Mongo games, unpublished CMS drafts, or static seed catalog slugs
 * so launcher installs still sync when CMS is incomplete.
 */
export async function resolveGameForSync(slug: string): Promise<Game | undefined> {
  const fromCms = await getGame(slug, { includeUnpublished: true });
  if (fromCms) return fromCms;
  const seed = seedGames.find((g) => g.slug === slug);
  return seed ? seedGameWithInstall(seed) : undefined;
}

export async function gamesFor(slugs: string[]): Promise<Game[]> {
  const all = await listGames();
  const map = new Map(all.map((g) => [g.slug, g]));
  return slugs.map((s) => map.get(s)).filter((g): g is Game => Boolean(g));
}

/** Newest catalog game by Mongo `createdAt` (homepage spotlight). */
export async function newestGame(): Promise<Game | undefined> {
  const all = await listGames();
  if (!all.length) return undefined;
  return [...all].sort(compareNewestFirst)[0];
}

/** Games newest-first — for client hero / listings that need recency order. */
export async function listGamesNewestFirst(): Promise<Game[]> {
  return [...(await listGames())].sort(compareNewestFirst);
}

function compareNewestFirst(a: Game, b: Game): number {
  const ta = Date.parse(a.createdAt || a.updatedAt || "") || 0;
  const tb = Date.parse(b.createdAt || b.updatedAt || "") || 0;
  if (tb !== ta) return tb - ta;
  return a.title.localeCompare(b.title);
}

/** @deprecated Prefer newestGame() — homepage no longer uses weekly issues. */
export async function gameOfTheWeek(): Promise<Game | undefined> {
  return newestGame();
}

export async function hiddenGems(): Promise<Game[]> {
  return (await listGames()).filter((g) => g.hiddenGem);
}

/**
 * Published games ranked by all-time playtime (`game_finished.durationMs`).
 * Cached briefly so the homepage does not re-aggregate telemetry every request.
 * Falls back to installCount when playtime data is thin.
 */
export async function mostPopularGames(limit = 12): Promise<Game[]> {
  return unstable_cache(
    () => computeMostPopularGames(limit),
    ["catalog-most-popular-playtime", String(limit)],
    { revalidate: 900, tags: ["catalog", "live-activity"] }
  )();
}

async function computeMostPopularGames(limit: number): Promise<Game[]> {
  const published = await listGames();
  if (!published.length) return [];
  const bySlug = new Map(published.map((g) => [g.slug, g]));
  const seen = new Set<string>();
  const ordered: Game[] = [];

  const pushSlug = (slug: string) => {
    if (seen.has(slug)) return;
    const game = bySlug.get(slug);
    if (!game) return;
    seen.add(slug);
    ordered.push(game);
  };

  try {
    await dbConnect();
    const rows = await TelemetryEvent.aggregate<{ _id: string; totalMs: number }>([
      {
        $match: {
          event: "game_finished",
          "properties.durationMs": { $exists: true, $gt: 0 },
          "properties.gameSlug": { $type: "string", $ne: "" },
        },
      },
      {
        $group: {
          _id: "$properties.gameSlug",
          totalMs: { $sum: "$properties.durationMs" },
        },
      },
      { $sort: { totalMs: -1 } },
      { $limit: Math.max(limit * 3, 24) },
    ]);

    for (const row of rows) {
      pushSlug(String(row._id));
      if (ordered.length >= limit) return ordered.slice(0, limit);
    }

    // Fill remaining slots from catalog install counts when playtime is sparse.
    const installDocs = await CatalogGame.find(mongoVisibleFilter({ includeTesting: false }))
      .select("slug installCount")
      .sort({ installCount: -1, title: 1 })
      .lean();

    for (const doc of installDocs) {
      pushSlug(String((doc as { slug?: string }).slug || ""));
      if (ordered.length >= limit) break;
    }
  } catch (err) {
    console.error("[catalog] mostPopularGames failed:", err);
    return published.slice(0, limit);
  }

  if (ordered.length < limit) {
    for (const game of published) {
      pushSlug(game.slug);
      if (ordered.length >= limit) break;
    }
  }

  return ordered.slice(0, limit);
}

export async function browserGames(): Promise<Game[]> {
  return (await listGames()).filter((g) => g.browserPlayable);
}

export async function gamesByDeveloper(devSlug: string): Promise<Game[]> {
  return (await listGames()).filter((g) => g.developerSlug === devSlug);
}

/** Collections containing a game. Reads the managed list, not the static seed. */
export async function collectionsFeaturing(slug: string): Promise<Collection[]> {
  return (await listCollections()).filter((c) => c.gameSlugs.includes(slug));
}

/** An edition match, carried with the game it belongs to so the UI can link it. */
export interface EditionSearchHit {
  edition: Edition;
  game: Game;
}

export interface SearchResults {
  games: Game[];
  developers: Developer[];
  collections: Collection[];
  /**
   * Editions matching by name, tag or slug. Searching "Turtle" has to surface
   * Turtle WoW even though its game is called World of Warcraft, so editions
   * are searched independently of game titles and joined back to their game.
   */
  editions: EditionSearchHit[];
}

export async function searchAll(
  query: string,
  opts?: { includeTesting?: boolean }
): Promise<SearchResults> {
  const q = query.trim().toLowerCase();
  const has = (...fields: (string | string[])[]) =>
    fields.some((f) =>
      Array.isArray(f) ? f.some((x) => x.toLowerCase().includes(q)) : f.toLowerCase().includes(q)
    );
  if (!q) return { games: [], developers: [], collections: [], editions: [] };
  const [games, allCollections, allDevelopers, editionMatches] = await Promise.all([
    listGames({ includeTesting: opts?.includeTesting }),
    listCollections(),
    listDevelopers(),
    searchEditions(query),
  ]);

  // Join each edition hit back to its game, dropping any whose game is not
  // visible to this viewer so a hidden game cannot leak through its editions.
  const gameBySlug = new Map(games.map((g) => [g.slug, g]));
  const editions: EditionSearchHit[] = [];
  for (const edition of editionMatches) {
    const game = gameBySlug.get(edition.gameSlug);
    if (game) editions.push({ edition, game });
  }

  return {
    // Aliases catch the shorthand people actually type ("WoW", "C&C") which
    // appears nowhere in the title or tags.
    games: games.filter((g) => has(g.title, g.tagline, g.tags, g.genres, g.aliases ?? [])),
    developers: allDevelopers.filter((d) => has(d.name, d.tagline)),
    collections: allCollections.filter((c) => has(c.title, c.description)),
    editions,
  };
}

export interface GameFilter {
  q?: string;
  genres?: string[];
  tags?: string[];
  platforms?: string[];
  features?: string[];
  sort?: "title" | "releaseYear" | "sizeMB";
  sortDir?: "asc" | "desc";
  maxSizeMB?: number;
}

export async function searchGames(
  filter: GameFilter,
  opts?: { includeTesting?: boolean }
): Promise<Game[]> {
  let games = await listGames({ includeTesting: opts?.includeTesting });

  if (filter.q) {
    const q = filter.q.trim().toLowerCase();
    if (q) {
      games = games.filter((g) => {
        const haystack = [g.title, g.tagline, ...g.tags, ...g.genres, ...g.features]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
  }

  if (filter.genres?.length) {
    const set = new Set(filter.genres);
    games = games.filter((g) => g.genres.some((genre) => set.has(genre)));
  }

  if (filter.tags?.length) {
    const set = new Set(filter.tags.map((t) => t.toLowerCase()));
    games = games.filter((g) =>
      g.tags.some((tag) => set.has(tag.toLowerCase()))
    );
  }

  if (filter.platforms?.length) {
    const set = new Set(filter.platforms.map((p) => p.toLowerCase()));
    games = games.filter((g) =>
      g.platforms.some((p) => set.has(p.toLowerCase()))
    );
  }

  if (filter.features?.length) {
    const set = new Set(filter.features.map((f) => f.toLowerCase()));
    games = games.filter((g) =>
      g.features.some((f) => set.has(f.toLowerCase()))
    );
  }

  if (filter.maxSizeMB != null && filter.maxSizeMB > 0) {
    games = games.filter((g) => g.sizeMB <= filter.maxSizeMB!);
  }

  const sortKey = filter.sort ?? "title";
  const dir = filter.sortDir ?? "asc";
  games.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "title") {
      cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    } else if (sortKey === "releaseYear") {
      cmp = a.releaseYear - b.releaseYear;
    } else if (sortKey === "sizeMB") {
      cmp = a.sizeMB - b.sizeMB;
    }
    return dir === "desc" ? -cmp : cmp;
  });

  return games;
}

export { seedGames };
