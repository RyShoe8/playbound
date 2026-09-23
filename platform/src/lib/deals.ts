import { listGames } from "@/lib/catalog";
import type { Game } from "@/lib/data/types";
import {
  DEEP_DISCOUNT_MIN_PERCENT,
  dealStoreKey,
  isDiscounted,
  percentOff,
  type DiscountedGame,
} from "@/lib/dealsShared";

/**
 * Discounted catalog games, for /deals.
 *
 * The free half of that page comes from lib/freeOffers — those are store
 * giveaways PlayBound tracks but does not curate. This is the other half: games
 * already in the catalog that are currently cheaper than their normal price.
 *
 * Deliberately derived rather than stored. `access.currentPriceCents` is already
 * refreshed by the offer-prices cron and `regularPriceCents` is the curated
 * undiscounted price, so "on sale" is a comparison, not a field somebody has to
 * remember to set. Adding an `isOnSale` flag would be a second source of truth
 * that goes stale the moment a sale ends.
 *
 * Note on eligibility: `qualifyingPriceCents` is what decides whether a game
 * belongs in the catalog at all, and it deliberately ignores sales so a title
 * does not enter and leave over a weekend promotion. It is the wrong field here,
 * because this page is *about* the weekend promotion.
 *
 * **This module is server-only** — `listGames` reaches the database and the
 * cache APIs. The type, the constant and the pure helpers live in
 * `lib/dealsShared.ts` so client components can use them, and are re-exported
 * here so server callers still have one import site.
 */

export {
  DEEP_DISCOUNT_MIN_PERCENT,
  dealStoreKey,
  isDiscounted,
  percentOff,
  formatCents,
} from "@/lib/dealsShared";
export type { DiscountedGame } from "@/lib/dealsShared";

/** The cheapest active offer, so the link goes where the price actually is. */
function cheapestOffer(access: NonNullable<Game["access"]>) {
  const active = (access.offers ?? []).filter((o) => o.isActive && o.url);
  if (active.length === 0) return null;
  return active.reduce((best, o) => (o.priceCents < best.priceCents ? o : best));
}

function toDiscountedGame(game: Game): DiscountedGame | null {
  const access = game.access;
  if (!access || !isDiscounted(access)) return null;
  const regular = access.regularPriceCents as number;
  const current = access.currentPriceCents as number;
  const offer = cheapestOffer(access);

  return {
    slug: game.slug,
    title: game.title,
    tagline: game.tagline ?? null,
    coverImage: game.coverImage ?? null,
    art: game.art,
    genres: game.genres ?? [],
    regularPriceCents: regular,
    currentPriceCents: current,
    currency: access.currency ?? "USD",
    percentOff: percentOff(regular, current),
    storeName: offer?.retailer ?? null,
    storeUrl: offer?.url ?? game.gogStoreUrl ?? null,
    storeKey: dealStoreKey(offer?.retailer),
  };
}

/**
 * Catalog games discounted past the bar, deepest discount first.
 *
 * Two separate filters, on purpose. `isDiscounted` is correctness — it rejects
 * data that cannot describe a real reduction. `minPercentOff` is curation — it
 * rejects real reductions that are not worth anyone's attention. Collapsing them
 * into one test would make a data bug and an editorial decision impossible to
 * tell apart later.
 *
 * Reads the live catalog through `listGames`, so it inherits that function's
 * caching and its published/testing filter rather than opening a second query
 * path into the games collection.
 */
export async function listDiscountedGames(opts?: {
  includeTesting?: boolean;
  /** Defaults to DEEP_DISCOUNT_MIN_PERCENT. Pass 0 for every real discount. */
  minPercentOff?: number;
}): Promise<DiscountedGame[]> {
  const floor = opts?.minPercentOff ?? DEEP_DISCOUNT_MIN_PERCENT;
  const games = await listGames(opts);
  return games
    .map(toDiscountedGame)
    .filter((g): g is DiscountedGame => g !== null && g.percentOff >= floor)
    .sort((a, b) => b.percentOff - a.percentOff || a.currentPriceCents - b.currentPriceCents);
}
