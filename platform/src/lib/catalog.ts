import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import type { Game, Genre, LaunchMethod } from "@/lib/data/types";
import { games as seedGames } from "@/lib/data/games";
import { developers, developersBySlug, collections, collectionsBySlug } from "@/lib/data";

export type { Game } from "@/lib/data/types";
export { developers, developersBySlug, collections, collectionsBySlug };

type LeanGame = Record<string, unknown>;

function toGame(doc: LeanGame): Game {
  return {
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
    githubRepo: (doc.githubRepo as string) || undefined,
    gameOfWeek: Boolean(doc.gameOfWeek),
    hiddenGem: Boolean(doc.hiddenGem),
    art: doc.art as Game["art"],
    coverImage: (doc.coverImage as string) || undefined,
    screenshots: (doc.screenshots as string[])?.length ? (doc.screenshots as string[]) : undefined,
    systemRequirements: doc.systemRequirements as Game["systemRequirements"],
  };
}

async function mongoHasCatalog(): Promise<boolean> {
  try {
    await dbConnect();
    return (await CatalogGame.countDocuments()) > 0;
  } catch {
    return false;
  }
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

/** Published games for the public site (falls back to seed catalog if DB empty). */
export async function listGames(): Promise<Game[]> {
  if (await mongoHasCatalog()) {
    return fromMongo({ published: true });
  }
  return seedGames;
}

/** All games including drafts (admin). */
export async function listAllGames(): Promise<(Game & { published: boolean; updatedAt?: string })[]> {
  try {
    await dbConnect();
    const docs = await CatalogGame.find().sort({ updatedAt: -1 }).lean();
    if (docs.length === 0) {
      return seedGames.map((g) => ({ ...g, published: true }));
    }
    return docs.map((d) => ({
      ...toGame(d as LeanGame),
      published: Boolean((d as LeanGame).published),
      updatedAt: (d as { updatedAt?: Date }).updatedAt?.toISOString(),
    }));
  } catch {
    return seedGames.map((g) => ({ ...g, published: true }));
  }
}

export async function getGame(
  slug: string,
  opts?: { includeUnpublished?: boolean }
): Promise<Game | undefined> {
  try {
    if (await mongoHasCatalog()) {
      const filter: Record<string, unknown> = { slug };
      if (!opts?.includeUnpublished) filter.published = true;
      const doc = await CatalogGame.findOne(filter).lean();
      return doc ? toGame(doc as LeanGame) : undefined;
    }
  } catch (err) {
    console.error("[catalog] getGame failed:", err);
  }
  return seedGames.find((g) => g.slug === slug);
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

export { seedGames };
