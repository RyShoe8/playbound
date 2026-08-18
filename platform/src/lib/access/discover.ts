/**
 * Viewer-aware catalog reads.
 *
 * The shared `listGames` cache must stay mode-blind — it is reused by admin,
 * the launcher, library, and crawlers. Filtering happens here, after the
 * cache, so FREE mode cannot poison those surfaces.
 */

import { cache } from "react";
import { listGames, listGamesNewestFirst, mostPopularGames } from "@/lib/catalog";
import type { Game } from "@/lib/data/types";
import { getDiscoveryMode } from "./discoveryMode.server";
import {
  filterBySlugAccess,
  filterCollectionsByMode,
  filterGamesByMode,
  type DiscoveryMode,
} from "./discoveryMode";
import { gameAccessTiers, type GameTierMap } from "./tiers";

export interface DiscoveryContext {
  mode: DiscoveryMode;
  tiers: GameTierMap;
}

export const getDiscoveryContext = cache(async (): Promise<DiscoveryContext> => {
  const [mode, tiers] = await Promise.all([getDiscoveryMode(), gameAccessTiers()]);
  return { mode, tiers };
});

export async function listDiscoverableGames(opts?: {
  includeTesting?: boolean;
}): Promise<Game[]> {
  const [games, ctx] = await Promise.all([listGames(opts), getDiscoveryContext()]);
  return filterGamesByMode(games, ctx.mode, ctx.tiers);
}

export async function listDiscoverableGamesNewestFirst(): Promise<Game[]> {
  const [games, ctx] = await Promise.all([listGamesNewestFirst(), getDiscoveryContext()]);
  return filterGamesByMode(games, ctx.mode, ctx.tiers);
}

export async function listDiscoverablePopular(limit = 12): Promise<Game[]> {
  const [games, ctx] = await Promise.all([mostPopularGames(limit), getDiscoveryContext()]);
  return filterGamesByMode(games, ctx.mode, ctx.tiers);
}

export async function filterDiscoverableBySlug<T>(
  items: T[],
  slugOf: (item: T) => string | null | undefined
): Promise<T[]> {
  const { mode, tiers } = await getDiscoveryContext();
  return filterBySlugAccess(items, mode, tiers, slugOf);
}

export async function filterDiscoverableCollections<T extends { gameSlugs: string[] }>(
  collections: T[]
): Promise<T[]> {
  const { mode, tiers } = await getDiscoveryContext();
  return filterCollectionsByMode(collections, mode, tiers);
}
