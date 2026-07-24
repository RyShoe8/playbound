import { games, gamesBySlug } from "./games";
import { developers, developersBySlug } from "./developers";
import { collections, collectionsBySlug } from "./collections";
import { events, eventsBySlug } from "./events";
import { currentUser, library, players } from "./players";
import {
  achievements,
  activity,
  discussions,
  guides,
  mods,
  news,
  reviews,
  servers,
} from "./community";
import type { Game } from "./types";

export * from "./types";
export {
  games,
  gamesBySlug,
  developers,
  developersBySlug,
  collections,
  collectionsBySlug,
  events,
  eventsBySlug,
  currentUser,
  library,
  players,
  achievements,
  activity,
  discussions,
  guides,
  mods,
  news,
  reviews,
  servers,
};

export function getGame(slug: string): Game | undefined {
  return gamesBySlug.get(slug);
}

export function gamesFor(slugs: string[]): Game[] {
  return slugs.map((s) => gamesBySlug.get(s)).filter((g): g is Game => Boolean(g));
}

export const gameOfTheWeek = games.find((g) => g.gameOfWeek) ?? games[0];

export const trendingGames = [...games].sort((a, b) => b.weeklyGrowth - a.weeklyGrowth);

export const browserGames = games.filter((g) => g.browserPlayable);

export const multiplayerNow = games
  .filter((g) => g.activeServers > 0)
  .sort((a, b) => b.playersOnline - a.playersOnline);

export const newReleases = games.filter((g) => g.isNewRelease);

export const hiddenGems = games.filter((g) => g.hiddenGem);

export const topRated = [...games].sort((a, b) => b.rating - a.rating);

export const continuePlaying = library
  .slice(0, 5)
  .map((entry) => ({ entry, game: gamesBySlug.get(entry.gameSlug)! }))
  .filter((x) => x.game);

export const friendsPlaying = players.filter(
  (p) => p.isFriend && p.currentGameSlug && (p.status === "Playing" || p.status === "Hosting Server")
);

export function gamesByDeveloper(devSlug: string): Game[] {
  return games.filter((g) => g.developerSlug === devSlug);
}

export function reviewsFor(slug: string) {
  return reviews.filter((r) => r.gameSlug === slug);
}
export function guidesFor(slug: string) {
  return guides.filter((g) => g.gameSlug === slug);
}
export function modsFor(slug: string) {
  return mods.filter((m) => m.gameSlug === slug);
}
export function serversFor(slug: string) {
  return servers.filter((s) => s.gameSlug === slug);
}
export function discussionsFor(slug: string) {
  return discussions.filter((d) => d.gameSlug === slug);
}
export function newsFor(slug: string) {
  return news.filter((n) => n.gameSlug === slug);
}
export function achievementsFor(slug: string) {
  return achievements.filter((a) => a.gameSlug === slug);
}
export function collectionsFeaturing(slug: string) {
  return collections.filter((c) => c.gameSlugs.includes(slug));
}

export const totalPlayersOnline = games.reduce((sum, g) => sum + g.playersOnline, 0);

export interface SearchResults {
  games: Game[];
  developers: typeof developers;
  collections: typeof collections;
  players: typeof players;
  events: typeof events;
  guides: typeof guides;
  mods: typeof mods;
}

export function searchAll(query: string): SearchResults {
  const q = query.trim().toLowerCase();
  const has = (...fields: (string | string[])[]) =>
    fields.some((f) =>
      Array.isArray(f) ? f.some((x) => x.toLowerCase().includes(q)) : f.toLowerCase().includes(q)
    );
  if (!q) {
    return { games: [], developers: [], collections: [], players: [], events: [], guides: [], mods: [] };
  }
  return {
    games: games.filter((g) => has(g.title, g.tagline, g.tags, g.genres)),
    developers: developers.filter((d) => has(d.name, d.tagline)),
    collections: collections.filter((c) => has(c.title, c.description)),
    players: players.filter((p) => has(p.handle, p.name)),
    events: events.filter((e) => has(e.title, e.type)),
    guides: guides.filter((g) => has(g.title, g.author)),
    mods: mods.filter((m) => has(m.name, m.summary)),
  };
}
