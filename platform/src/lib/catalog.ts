import { cache } from "react";
import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import type { Game, Genre, LaunchMethod } from "@/lib/data/types";
import type { LauncherInstall } from "@/lib/launcherInstall";
import { games as seedGames } from "@/lib/data/games";
import { editorial } from "@/lib/data/editorial";
import {
  DUNGEON_KEEPER_GOLD_SLUG,
  dungeonKeeperGoldHardwareRequirements,
  dungeonKeeperGoldSystemRequirements,
} from "@/lib/data/dungeonKeeperGoldSpecs";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { collections, collectionsBySlug } from "@/lib/data";
import { listCollections } from "@/lib/collections";
import { listDevelopers } from "@/lib/developers";
import { searchEditions } from "@/lib/editions";
import type { Edition } from "@/lib/editionTypes";
import type { Collection, Developer } from "@/lib/data/types";
import { mongoVisibleFilter, normalizeStatus, type CatalogStatus } from "@/lib/catalogStatus";
import { normalizeQualityBar } from "@/lib/gamePayload";
import { accessFromDoc } from "@/lib/access/docs";
import { pickHardwareRequirements, pickSystemRequirements } from "@/lib/catalogRequirements";

export type { Game } from "@/lib/data/types";
// Developers are deliberately no longer re-exported here. They are database
// backed now, so reaching for the static list would silently serve only the
// nineteen seed entries and miss anything added through the admin — import
// from "@/lib/developers" instead.
export { collections, collectionsBySlug };

type LeanGame = Record<string, unknown>;

function attachLauncherInstall(game: Game, doc?: LeanGame): Game {
  const fromDoc = doc?.launcherInstall as LauncherInstall | null | undefined;
  const seed = seedBySlug.get(game.slug)?.launcherInstall || launcherInstallBySlug[game.slug];
  if (fromDoc?.enabled && fromDoc?.kind) {
    const merged: LauncherInstall = { ...fromDoc };
    if (!merged.connectArgs?.length && seed?.connectArgs?.length) {
      merged.connectArgs = seed.connectArgs;
    }
    // A content overlay can safely fill in only when the stored recipe has no
    // value. This keeps existing database curation authoritative while letting
    // a narrowly-scoped launcher repair (such as Daggerfall's free game data)
    // reach already-stored catalog rows without a database write.
    if (!merged.overlayUrl && seed?.overlayUrl) merged.overlayUrl = seed.overlayUrl;
    if (!merged.overlayFileName && seed?.overlayFileName) merged.overlayFileName = seed.overlayFileName;
    if (!merged.overlayDest && seed?.overlayDest) merged.overlayDest = seed.overlayDest;
    if (!merged.unwrapSingleRoot && seed?.unwrapSingleRoot) merged.unwrapSingleRoot = true;
    // ET: Legacy has no GitHub release assets and the former database recipe
    // was an external download-page hand-off. Serve the verified official
    // archive recipe at read time until that one game is next edited; this is
    // deliberately read-only and leaves every stored catalog field intact.
    if (
      game.slug === "wolfenstein-enemy-territory" &&
      seed?.kind === "direct-zip" &&
      (merged.kind === "github-zip" || merged.kind === "external")
    ) {
      merged.kind = seed.kind;
      merged.url = seed.url;
      merged.fileName = seed.fileName;
      merged.checksumMd5 = seed.checksumMd5;
      merged.exeHint = seed.exeHint;
      merged.versionLabel = seed.versionLabel;
    }
    // tes-arena: a PlayBound OpenTESArena zip was previously saved as the
    // parent game recipe. That package is the engine edition; the original
    // freeware files are a separate archive. Restore the seed until Mongo is
    // next saved for this slug.
    if (
      game.slug === "tes-arena" &&
      seed?.kind === "direct-zip" &&
      typeof merged.url === "string" &&
      /OpenTESArena/i.test(merged.url)
    ) {
      merged.kind = seed.kind;
      merged.url = seed.url;
      merged.fileName = seed.fileName;
      merged.exeHint = seed.exeHint;
      merged.knownExePaths = seed.knownExePaths;
      merged.versionLabel = seed.versionLabel;
      merged.note = seed.note;
    }
    return { ...game, launcherInstall: merged };
  }
  if (seed) return { ...game, launcherInstall: seed };
  return game;
}

function toGame(doc: LeanGame): Game {
  const seed = seedBySlug.get(String(doc.slug));
  const extra = overlayForMongoOnly(String(doc.slug));
  const status = normalizeStatus(doc);

  const base: Game = {
    slug: String(doc.slug),
    title: String(doc.title) || seed?.title || "",
    tagline: String(doc.tagline) || seed?.tagline || "",
    description: String(doc.description) || seed?.description || "",
    developerSlug: String(doc.developerSlug) || seed?.developerSlug || "",
    genres: (doc.genres as Genre[])?.length ? (doc.genres as Genre[]) : (seed?.genres ?? []),
    tags: (doc.tags as string[])?.length ? (doc.tags as string[]) : (seed?.tags ?? []),
    aliases: (doc.aliases as string[])?.length ? (doc.aliases as string[]) : (seed?.aliases ?? []),
    license: String(doc.license) || seed?.license || "",
    releaseYear: (typeof doc.releaseYear === "number" && doc.releaseYear > 1970 ? doc.releaseYear : seed?.releaseYear) || 0,
    sizeMB: (typeof doc.sizeMB === "number" && doc.sizeMB > 0 ? doc.sizeMB : seed?.sizeMB) || 0,
    // Mongo is authoritative for visibility. A seed only fills editorial
    // fields that are absent from an older document; it must never turn an
    // explicitly drafted game back into a public one.
    status,
    platforms: (doc.platforms as string[])?.length ? (doc.platforms as string[]) : (seed?.platforms ?? []),
    features: (doc.features as string[])?.length ? (doc.features as string[]) : (seed?.features ?? []),
    launchMethods: (doc.launchMethods as LaunchMethod[])?.length ? (doc.launchMethods as LaunchMethod[]) : (seed?.launchMethods ?? ["install"]),
    browserPlayable: Boolean(doc.browserPlayable ?? seed?.browserPlayable),
    steamDeck: Boolean(doc.steamDeck ?? seed?.steamDeck),
    website: String(doc.website) || seed?.website || "",
    steamAppId: (doc.steamAppId as string) || seed?.steamAppId,
    androidStoreUrl: (doc.androidStoreUrl as string) || seed?.androidStoreUrl,
    iosStoreUrl: (doc.iosStoreUrl as string) || seed?.iosStoreUrl,
    githubRepo: (doc.githubRepo as string) || seed?.githubRepo,
    gameOfWeek: Boolean(doc.gameOfWeek ?? seed?.gameOfWeek),
    hiddenGem: Boolean(doc.hiddenGem ?? seed?.hiddenGem),
    masterCopy: Boolean(doc.masterCopy ?? seed?.masterCopy),
    complete: Boolean(doc.complete ?? seed?.complete),
    // Left undefined when unclassified, which every consumer reads as free.
    access: accessFromDoc(doc.access) ?? seed?.access,
    art: (doc.art as Game["art"]) || seed?.art || { from: "#1e293b", to: "#64748b", icon: "Gamepad2" },
    coverImage: (doc.coverImage as string) || usableSeedMedia(seed?.coverImage),
    screenshots: (doc.screenshots as string[])?.length
      ? (doc.screenshots as string[])
      : usableSeedScreenshots(seed?.screenshots),
    videos: (doc.videos as string[])?.length ? (doc.videos as string[]) : seed?.videos,
    systemRequirements: pickSystemRequirements(
      doc.systemRequirements,
      seed?.systemRequirements,
      extra?.systemRequirements
    ),
    hardwareRequirements: pickHardwareRequirements(
      doc.hardwareRequirements as Game["hardwareRequirements"],
      seed?.hardwareRequirements,
      extra?.hardwareRequirements
    ),

    qualityBar:
      normalizeQualityBar(
        (doc.qualityBar && typeof doc.qualityBar === "object" && (doc.qualityBar as { verdict?: string }).verdict)
          ? (doc.qualityBar as Parameters<typeof normalizeQualityBar>[0])
          : seed?.qualityBar ?? extra?.qualityBar
      ) ?? undefined,
    longDescription:
      (doc.longDescription as string) || seed?.longDescription || extra?.longDescription,
    whyWePickedIt:
      (doc.whyWePickedIt as string) || seed?.whyWePickedIt || extra?.whyWePickedIt,
    installSteps:
      (doc.installSteps as Game["installSteps"])?.length
        ? (doc.installSteps as Game["installSteps"])
        : seed?.installSteps ?? extra?.installSteps,
    faq: (doc.faq as Game["faq"])?.length
      ? (doc.faq as Game["faq"])
      : seed?.faq ?? extra?.faq,
    bestFor: (doc.bestFor as string[])?.length
      ? (doc.bestFor as string[])
      : seed?.bestFor ?? extra?.bestFor,
    notFor: (doc.notFor as string[])?.length
      ? (doc.notFor as string[])
      : seed?.notFor ?? extra?.notFor,
    comparableTo: (doc.comparableTo as string[])?.length
      ? (doc.comparableTo as string[])
      : seed?.comparableTo ?? extra?.comparableTo,
    updatedAt: (doc as { updatedAt?: Date }).updatedAt
      ? new Date((doc as { updatedAt: Date }).updatedAt).toISOString()
      : undefined,
    publishedAt: (doc as { publishedAt?: Date | null }).publishedAt
      ? new Date((doc as { publishedAt: Date }).publishedAt).toISOString()
      : undefined,
    createdAt: (doc as { createdAt?: Date }).createdAt
      ? new Date((doc as { createdAt: Date }).createdAt).toISOString()
      : undefined,
    communityLinks: mapCommunityLinks(doc.communityLinks) || seed?.communityLinks,
    playboundSupported: doc.playboundSupported !== false,
    epicStoreUrl: (doc.epicStoreUrl as string) || undefined,
    gogStoreUrl: (doc.gogStoreUrl as string) || undefined,
    externalIds: (doc.externalIds as Game["externalIds"]) || undefined,
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
const seedBySlug = new Map<string, Game>();
for (const g of seedGames) {
  seedBySlug.set(g.slug, g);
  if (g.aliases) {
    for (const alias of g.aliases) {
      const lower = alias.toLowerCase();
      if (!seedBySlug.has(lower)) {
        seedBySlug.set(lower, g);
      }
    }
  }
}

/** Mongo-only titles with overlay copy/specs and no games.ts stub. */
function overlayForMongoOnly(slug: string) {
  if (slug !== DUNGEON_KEEPER_GOLD_SLUG) return undefined;
  const ed = editorial[slug];
  return {
    ...(ed ?? {}),
    systemRequirements: dungeonKeeperGoldSystemRequirements,
    hardwareRequirements: dungeonKeeperGoldHardwareRequirements,
  };
}

function seedGameWithInstall(g: Game): Game {
  return attachLauncherInstall(g);
}

/** Seed local /games/... paths mostly 404; only keep remote seed media. */
function usableSeedMedia(url?: string): string | undefined {
  const value = String(url || "").trim();
  if (!value || value.startsWith("/games/")) return undefined;
  return value;
}

function usableSeedScreenshots(urls?: string[]): string[] | undefined {
  if (!urls?.length) return undefined;
  const kept = urls.map((u) => usableSeedMedia(u)).filter((u): u is string => Boolean(u));
  return kept.length ? kept : undefined;
}

async function fromMongo(filter: Record<string, unknown> = {}): Promise<Game[]> {
  try {
    await dbConnect();
    const docs = await CatalogGame.find(filter).sort({ title: 1 }).lean();
    return docs.map((d) => toGame(d as LeanGame));
  } catch (err) {
    console.error("[catalog] Mongo read failed:", err);
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
async function readVisibleGames(includeTesting: boolean): Promise<Game[]> {
  const filter = {
    ...mongoVisibleFilter({ includeTesting }),
    playboundSupported: { $ne: false },
  };
  return fromMongo(filter);
}

/**
 * Two layers on purpose, because they solve different problems.
 *
 * `cache()` dedupes within a single request — the reason it was here already.
 * `unstable_cache` persists across requests, which is what the pages actually
 * needed: every page calls getServerSession (see requestIncludesTesting), which
 * makes it dynamic and therefore never CDN-cached, so each visitor was paying
 * this query from scratch. Tagged so admin writes can drop it immediately
 * rather than serving a stale catalog for the full window.
 */
const loadPublishedGames = cache(async (): Promise<Game[]> =>
  unstable_cache(() => readVisibleGames(false), ["catalog-games", "published"], {
    revalidate: 300,
    tags: ["catalog"],
  })()
);

const loadPublishedAndTestingGames = cache(async (): Promise<Game[]> =>
  unstable_cache(() => readVisibleGames(true), ["catalog-games", "published+testing"], {
    revalidate: 300,
    tags: ["catalog"],
  })()
);

/** Visible catalog. Pass `includeTesting` for admin viewers (published + testing). */
export async function listGames(opts?: { includeTesting?: boolean }): Promise<Game[]> {
  if (opts?.includeTesting) return loadPublishedAndTestingGames();
  return loadPublishedGames();
}

/** All games including drafts (admin). */
export async function listAllGames(): Promise<
  (Game & { published: boolean; status: CatalogStatus; updatedAt?: string; publishedAt?: string | null; installCount?: number })[]
> {
  try {
    await dbConnect();
    const docs = await CatalogGame.find().sort({ updatedAt: -1 }).lean();
    const dbGames = docs.map((d) => {
      const lean = d as LeanGame;
      const status = normalizeStatus(lean);
      return {
        ...toGame(lean),
        published: status === "published",
        status,
        updatedAt: (d as { updatedAt?: Date }).updatedAt?.toISOString(),
        publishedAt: (d as { publishedAt?: Date | null }).publishedAt?.toISOString() ?? null,
        installCount: Number((d as { installCount?: number }).installCount) || 0,
      };
    });
    return dbGames;
  } catch (err) {
    console.error("[catalog] listAllGames failed:", err);
    return [];
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

  return undefined;
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

export async function gamesFor(
  slugs: string[],
  opts?: { includeUnpublished?: boolean }
): Promise<Game[]> {
  if (!slugs.length) return [];

  if (opts?.includeUnpublished) {
    const unique = [...new Set(slugs)];
    const resolved = await Promise.all(
      unique.map((s) => getGame(s, { includeUnpublished: true }))
    );
    const map = new Map(
      resolved.filter((g): g is Game => Boolean(g)).map((g) => [g.slug, g])
    );
    return slugs.map((s) => map.get(s)).filter((g): g is Game => Boolean(g));
  }

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
  const ta = Date.parse(a.publishedAt || a.createdAt || a.updatedAt || "") || 0;
  const tb = Date.parse(b.publishedAt || b.createdAt || b.updatedAt || "") || 0;
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

/**
 * Completed play sessions per slug, all time.
 *
 * Counts `game_finished` events rather than summing their durationMs: the
 * question "plays" answers is how many times a game got played, which a
 * handful of marathon sessions should not be able to dominate — that is what
 * mostPopularGames already ranks by. Cached on the same cadence as the rest of
 * the activity figures.
 */
export function playCountsBySlug(): Promise<Record<string, number>> {
  return unstable_cache(computePlayCountsBySlug, ["catalog-play-counts"], {
    revalidate: 900,
    tags: ["catalog", "live-activity"],
  })();
}

async function computePlayCountsBySlug(): Promise<Record<string, number>> {
  try {
    await dbConnect();
    const rows = await TelemetryEvent.aggregate<{ _id: string; plays: number }>([
      {
        $match: {
          event: "game_finished",
          "properties.gameSlug": { $type: "string", $ne: "" },
        },
      },
      { $group: { _id: "$properties.gameSlug", plays: { $sum: 1 } } },
    ]);
    const out: Record<string, number> = {};
    for (const row of rows) out[String(row._id)] = Number(row.plays) || 0;
    return out;
  } catch (err) {
    console.error("[catalog] playCountsBySlug failed:", err);
    return {};
  }
}

export interface GameFilter {
  q?: string;
  genres?: string[];
  tags?: string[];
  platforms?: string[];
  features?: string[];
  /*
   * No "sizeMB". Size survives as the maxSizeMB *filter*, which is the real
   * question ("what fits on my disk"); ordering the whole catalog by megabytes
   * ranks games by something nobody is shopping for.
   */
  sort?: "title" | "releaseYear" | "players" | "plays";
  sortDir?: "asc" | "desc";
  maxSizeMB?: number;
}

export async function searchGames(
  filter: GameFilter,
  opts?: {
    includeTesting?: boolean;
    /**
     * Live concurrent players per slug, for sort=players. Passed in rather
     * than imported because liveActivity imports this module — reaching back
     * the other way would close an import cycle.
     */
    playingNow?: Record<string, number>;
  }
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

  const players = sortKey === "players" ? opts?.playingNow ?? {} : null;
  const plays = sortKey === "plays" ? await playCountsBySlug() : null;

  const byTitle = (a: Game, b: Game) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

  games.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "title") {
      cmp = byTitle(a, b);
    } else if (sortKey === "releaseYear") {
      cmp = a.releaseYear - b.releaseYear;
    } else if (players) {
      cmp = (players[a.slug] ?? 0) - (players[b.slug] ?? 0);
    } else if (plays) {
      cmp = (plays[a.slug] ?? 0) - (plays[b.slug] ?? 0);
    }
    if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    /*
     * Most games share a count of zero on both activity sorts, so without a
     * tiebreak their order is whatever listGames happened to return and shifts
     * between requests. Title breaks the tie, and deliberately outside the
     * direction flip: on "most players first" the inactive tail should still
     * read A–Z rather than Z–A.
     */
    return sortKey === "title" ? 0 : byTitle(a, b);
  });

  return games;
}

export { seedGames };

/**
 * Find a catalog game by store-specific external ID.
 * Used during ingestion to match free-offer games against the catalog.
 */
export async function findGameByExternalId(
  store: "epic" | "steam" | "gog",
  externalId: string
): Promise<Game | undefined> {
  try {
    await dbConnect();
    const filter: Record<string, unknown> =
      store === "steam"
        ? { $or: [{ [`externalIds.${store}`]: externalId }, { steamAppId: externalId }] }
        : { [`externalIds.${store}`]: externalId };
    const doc = await CatalogGame.findOne(filter).lean();
    return doc ? toGame(doc as LeanGame) : undefined;
  } catch (err) {
    console.error("[catalog] findGameByExternalId failed:", err);
    return undefined;
  }
}

/**
 * Find a catalog game by store URL (exact match on epicStoreUrl / gogStoreUrl / website).
 */
export async function findGameByStoreUrl(
  store: "epic" | "steam" | "gog",
  url: string
): Promise<Game | undefined> {
  try {
    await dbConnect();
    const filter: Record<string, unknown> =
      store === "epic"
        ? { epicStoreUrl: url }
        : store === "gog"
          ? { gogStoreUrl: url }
          : { website: url };
    const doc = await CatalogGame.findOne(filter).lean();
    return doc ? toGame(doc as LeanGame) : undefined;
  } catch (err) {
    console.error("[catalog] findGameByStoreUrl failed:", err);
    return undefined;
  }
}

/**
 * Find catalog games by normalized title for matching.
 * Returns all title matches — the caller decides on confidence.
 */
export async function findGamesByTitle(title: string): Promise<Game[]> {
  if (!title.trim()) return [];
  try {
    await dbConnect();
    const regex = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const docs = await CatalogGame.find({ title: regex }).lean();
    return docs.map((d) => toGame(d as LeanGame));
  } catch (err) {
    console.error("[catalog] findGamesByTitle failed:", err);
    return [];
  }
}
