/**
 * The viewer's discovery mode: FREE, or ALL.
 *
 * One switch governing the whole platform. The contract is deliberately
 * absolute — in FREE mode nothing that costs money appears anywhere, not in
 * search, not in a collection, not as a related game, not in an event feed.
 * A single surface that forgets is worse than not shipping the mode, because
 * it turns a promise into a thing the player has to double-check.
 *
 * Pure by design: no cookie access, no Next imports, so the rules can be
 * tested directly. Reading the viewer's mode lives in `discoveryMode.server`.
 */

import type { AccessTier } from "./types";
import { tierFor, type GameTierMap } from "./tiers";

export type DiscoveryMode = "FREE" | "ALL";

export const DISCOVERY_MODE_COOKIE = "pb_discovery";

/**
 * Default for anyone who has not chosen — including every crawler.
 *
 * ALL rather than FREE: the catalog is curated, and a first-time visitor
 * seeing a silently filtered version of it has no way to know something is
 * missing. FREE is a choice a player makes, not a state they arrive in. Flip
 * this one constant to change the platform's default.
 */
export const DEFAULT_DISCOVERY_MODE: DiscoveryMode = "ALL";

/** A cookie is untrusted input; anything unrecognised falls back to default. */
export function parseDiscoveryMode(raw: string | null | undefined): DiscoveryMode {
  return raw === "FREE" ? "FREE" : raw === "ALL" ? "ALL" : DEFAULT_DISCOVERY_MODE;
}

/** A year — this is a preference, not a session. */
export const DISCOVERY_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function discoveryModeCookie(mode: DiscoveryMode): string {
  return `${DISCOVERY_MODE_COOKIE}=${mode}; Path=/; Max-Age=${DISCOVERY_MODE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Does this tier survive the mode?
 *
 * The one predicate everything else is built from, so there is exactly one
 * place where "visible in FREE mode" is defined.
 */
export function tierVisibleIn(tier: AccessTier, mode: DiscoveryMode): boolean {
  return mode === "ALL" || tier === "FREE";
}

/**
 * Filter anything that carries a game slug.
 *
 * Takes an accessor rather than requiring a shape, because the things that
 * need filtering are not all games — collection entries, search hits, event
 * rows and server listings all reduce to "which game is this about".
 */
export function filterBySlugAccess<T>(
  items: T[],
  mode: DiscoveryMode,
  tiers: GameTierMap,
  slugOf: (item: T) => string | null | undefined
): T[] {
  if (mode === "ALL") return items;
  return items.filter((item) => {
    const slug = slugOf(item);
    // No slug means nothing to check against; a general item is not a paid one.
    if (!slug) return true;
    return tierVisibleIn(tierFor(tiers, slug).tier, mode);
  });
}

/** The common case: a list of things with a `slug`. */
export function filterGamesByMode<T extends { slug: string }>(
  games: T[],
  mode: DiscoveryMode,
  tiers: GameTierMap
): T[] {
  return filterBySlugAccess(games, mode, tiers, (g) => g.slug);
}

/**
 * Collections stay valid with a subset of their games. An empty remainder is
 * dropped — a collection of zero titles is not a collection.
 */
export function filterCollectionsByMode<T extends { gameSlugs: string[] }>(
  collections: T[],
  mode: DiscoveryMode,
  tiers: GameTierMap
): T[] {
  if (mode === "ALL") return collections;
  return collections
    .map((c) => ({
      ...c,
      gameSlugs: c.gameSlugs.filter((slug) => tierVisibleIn(tierFor(tiers, slug).tier, mode)),
    }))
    .filter((c) => c.gameSlugs.length > 0);
}

export const PRICE_FILTERS = ["any", "free", "under5", "under10", "under15"] as const;
export type PriceFilter = (typeof PRICE_FILTERS)[number];

export function parsePriceFilter(raw: string | null | undefined): PriceFilter {
  if (raw === "free" || raw === "under5" || raw === "under10" || raw === "under15") return raw;
  return "any";
}

const PRICE_CAPS: Record<Exclude<PriceFilter, "any" | "free">, number> = {
  under5: 500,
  under10: 1000,
  under15: 1500,
};

/** FREE games (null / 0) pass every under-X filter. */
export function priceVisibleIn(fromPriceCents: number | null, filter: PriceFilter): boolean {
  if (filter === "any") return true;
  const price = fromPriceCents ?? 0;
  if (filter === "free") return price === 0;
  return price <= PRICE_CAPS[filter];
}

export function filterGamesByPrice<T extends { slug: string }>(
  games: T[],
  filter: PriceFilter,
  tiers: GameTierMap
): T[] {
  if (filter === "any") return games;
  return games.filter((g) => priceVisibleIn(tierFor(tiers, g.slug).fromPriceCents, filter));
}

/** Card label. Free, or the lowest listed price — never a "from" floor. */
export function accessPriceLabel(fromPriceCents: number | null): string {
  if (fromPriceCents == null || fromPriceCents === 0) return "FREE";
  return `$${(fromPriceCents / 100).toFixed(2)}`;
}

/** Mod / edition line when the base game costs money. Null when the chain is free. */
export function requiresGamePriceLine(
  gameTitle: string,
  fromPriceCents: number | null
): string | null {
  if (fromPriceCents == null || fromPriceCents === 0) return null;
  return `Requires ${gameTitle} — $${(fromPriceCents / 100).toFixed(2)}`;
}
