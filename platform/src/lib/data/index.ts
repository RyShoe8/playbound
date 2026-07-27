import { games, gamesBySlug } from "./games";
import { developers, developersBySlug } from "./developers";
import { collections, collectionsBySlug } from "./collections";
import { mods, modsBySlug, modsForBaseGame } from "./mods";
import type { Game } from "./types";

export * from "./types";
export {
  games,
  gamesBySlug,
  developers,
  developersBySlug,
  collections,
  collectionsBySlug,
  mods,
  modsBySlug,
  modsForBaseGame,
};

export function getGame(slug: string): Game | undefined {
  return gamesBySlug.get(slug);
}

export function gamesFor(slugs: string[]): Game[] {
  return slugs.map((s) => gamesBySlug.get(s)).filter((g): g is Game => Boolean(g));
}

export const gameOfTheWeek = games.find((g) => g.gameOfWeek) ?? games[0];

export const hiddenGems = games.filter((g) => g.hiddenGem);

/** Games that run directly in the browser via PlayBound — none yet. */
export const browserGames = games.filter((g) => g.browserPlayable);

export function gamesByDeveloper(devSlug: string): Game[] {
  return games.filter((g) => g.developerSlug === devSlug);
}

export function collectionsFeaturing(slug: string) {
  return collections.filter((c) => c.gameSlugs.includes(slug));
}

export interface SearchResults {
  games: Game[];
  developers: typeof developers;
  collections: typeof collections;
}

export function searchAll(query: string): SearchResults {
  const q = query.trim().toLowerCase();
  const has = (...fields: (string | string[])[]) =>
    fields.some((f) => (Array.isArray(f) ? f.some((x) => x.toLowerCase().includes(q)) : f.toLowerCase().includes(q)));
  if (!q) return { games: [], developers: [], collections: [] };
  return {
    games: games.filter((g) => has(g.title, g.tagline, g.tags, g.genres)),
    developers: developers.filter((d) => has(d.name, d.tagline)),
    collections: collections.filter((c) => has(c.title, c.description)),
  };
}
