import { cache } from "react";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import type { Game, Genre, LaunchMethod } from "@/lib/data/types";
import type { LauncherInstall } from "@/lib/launcherInstall";
import { games as seedGames } from "@/lib/data/games";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { developers, developersBySlug, collections, collectionsBySlug } from "@/lib/data";

export type { Game } from "@/lib/data/types";
export { developers, developersBySlug, collections, collectionsBySlug };

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
  const base: Game = {
    slug: String(doc.slug),
    title: String(doc.title),
    tagline: String(doc.tagline),
    description: String(doc.description),
    developerSlug: String(doc.developerSlug),
    genres: (doc.genres as Genre[]) ?? [],
    tags: (doc.tags as string[]) ?? [],
    license: String(doc.license),
    releaseYear: Number(doc.releaseYear),
    sizeMB: Number(doc.sizeMB),
    platforms: (doc.platforms as string[]) ?? [],
    features: (doc.features as string[]) ?? [],
    launchMethods: (doc.launchMethods as LaunchMethod[]) ?? [],
    browserPlayable: Boolean(doc.browserPlayable),
    steamDeck: Boolean(doc.steamDeck),
    website: String(doc.website),
    steamAppId: (doc.steamAppId as string) || undefined,
    githubRepo: (doc.githubRepo as string) || undefined,
    gameOfWeek: Boolean(doc.gameOfWeek),
    hiddenGem: Boolean(doc.hiddenGem),
    art: doc.art as Game["art"],
    coverImage: (doc.coverImage as string) || seedBySlug.get(String(doc.slug))?.coverImage,
    screenshots: (doc.screenshots as string[])?.length ? (doc.screenshots as string[]) : undefined,
    videos: (doc.videos as string[])?.length ? (doc.videos as string[]) : undefined,
    systemRequirements: doc.systemRequirements as Game["systemRequirements"],

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
  const fromDb = await fromMongo({ published: true });
  if (fromDb.length > 0) return fromDb;
  return seedGames.map(seedGameWithInstall);
});

/** Published games for the public site (falls back to seed catalog if DB empty). */
export async function listGames(): Promise<Game[]> {
  return loadPublishedGames();
}

/** All games including drafts (admin). */
export async function listAllGames(): Promise<
  (Game & { published: boolean; updatedAt?: string; installCount?: number })[]
> {
  try {
    await dbConnect();
    const docs = await CatalogGame.find().sort({ updatedAt: -1 }).lean();
    if (docs.length === 0) {
      return seedGames.map((g) => ({ ...seedGameWithInstall(g), published: true, installCount: 0 }));
    }
    return docs.map((d) => ({
      ...toGame(d as LeanGame),
      published: Boolean((d as LeanGame).published),
      updatedAt: (d as { updatedAt?: Date }).updatedAt?.toISOString(),
      installCount: Number((d as { installCount?: number }).installCount) || 0,
    }));
  } catch {
    return seedGames.map((g) => ({ ...seedGameWithInstall(g), published: true, installCount: 0 }));
  }
}

export async function getGame(
  slug: string,
  opts?: { includeUnpublished?: boolean }
): Promise<Game | undefined> {
  // Published lookups reuse the per-request catalog, so a page that already
  // listed games does not pay for a second query to resolve one of them.
  if (!opts?.includeUnpublished) {
    const found = (await loadPublishedGames()).find((g) => g.slug === slug);
    if (found) return found;
  }

  try {
    await dbConnect();
    const filter: Record<string, unknown> = { slug };
    if (!opts?.includeUnpublished) filter.published = true;
    const doc = await CatalogGame.findOne(filter).lean();
    if (doc) return toGame(doc as LeanGame);
  } catch (err) {
    console.error("[catalog] getGame failed:", err);
  }

  const seed = seedGames.find((g) => g.slug === slug);
  return seed ? seedGameWithInstall(seed) : undefined;
}

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

export async function gameOfTheWeek(): Promise<Game | undefined> {
  const all = await listGames();
  return all.find((g) => g.gameOfWeek) ?? all[0];
}

export async function hiddenGems(): Promise<Game[]> {
  return (await listGames()).filter((g) => g.hiddenGem);
}

export async function browserGames(): Promise<Game[]> {
  return (await listGames()).filter((g) => g.browserPlayable);
}

export async function gamesByDeveloper(devSlug: string): Promise<Game[]> {
  return (await listGames()).filter((g) => g.developerSlug === devSlug);
}

export function collectionsFeaturing(slug: string) {
  return collections.filter((c) => c.gameSlugs.includes(slug));
}

export interface SearchResults {
  games: Game[];
  developers: typeof developers;
  collections: typeof collections;
}

export async function searchAll(query: string): Promise<SearchResults> {
  const q = query.trim().toLowerCase();
  const has = (...fields: (string | string[])[]) =>
    fields.some((f) =>
      Array.isArray(f) ? f.some((x) => x.toLowerCase().includes(q)) : f.toLowerCase().includes(q)
    );
  if (!q) return { games: [], developers: [], collections: [] };
  const games = await listGames();
  return {
    games: games.filter((g) => has(g.title, g.tagline, g.tags, g.genres)),
    developers: developers.filter((d) => has(d.name, d.tagline)),
    collections: collections.filter((c) => has(c.title, c.description)),
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

export async function searchGames(filter: GameFilter): Promise<Game[]> {
  let games = await listGames();

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
