import { listGames } from "@/lib/catalog";
import type { Game } from "@/lib/data/types";
import type { Cents } from "@/lib/access/types";

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
 */

/**
 * How deep a discount has to be before PlayBound calls it a deal.
 *
 * PlayBound curates around free and *high value* — "big discounts", not any
 * discount. A game at 10% off is a price change; listing it beside a giveaway
 * would teach readers that the section is noise and cost us the credibility of
 * the ones that are genuinely remarkable.
 *
 * 75% is deliberately demanding. The paid catalog sits at $5.99–$14.99, so this
 * bar means roughly $1.49–$3.74 — the level GOG and Steam actually reach on
 * seasonal sales for older titles, and rare enough the rest of the time that an
 * empty section is the honest normal state rather than a bug.
 *
 * A constant, not a literal, because it is a curation judgement someone will
 * want to revisit — and because the copy on /deals reads it, so the page cannot
 * advertise one number while filtering by another.
 */
export const DEEP_DISCOUNT_MIN_PERCENT = 75;

export type DiscountedGame = {
  slug: string;
  title: string;
  tagline: string | null;
  coverImage: string | null;
  art: Game["art"];
  genres: string[];
  regularPriceCents: Cents;
  currentPriceCents: Cents;
  currency: string;
  /** Whole percent off, rounded down so we never overstate a discount. */
  percentOff: number;
  /** Cheapest active retail offer, when the game lists one. */
  storeName: string | null;
  storeUrl: string | null;
};

/**
 * Is this game cheaper than usual right now?
 *
 * Exported for the test, because every one of these guards is a way to
 * advertise a discount that does not exist:
 *   - a null on either side is unknown, not free
 *   - equal prices are the normal state, not a 0% sale
 *   - current > regular means the curated regular price is stale; showing it as
 *     a negative discount would be worse than showing nothing
 *   - a non-positive regular price cannot produce a meaningful percentage
 */
export function isDiscounted(access: Game["access"] | undefined): boolean {
  if (!access) return false;
  if (access.priceType !== "PAID") return false;
  const regular = access.regularPriceCents;
  const current = access.currentPriceCents;
  if (typeof regular !== "number" || typeof current !== "number") return false;
  if (regular <= 0 || current < 0) return false;
  return current < regular;
}

/** Whole percent off, floored. 999 → 599 is 40%, not 40.04%. */
export function percentOff(regularCents: number, currentCents: number): number {
  if (regularCents <= 0) return 0;
  return Math.floor(((regularCents - currentCents) / regularCents) * 100);
}

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

/** `599` → `"$5.99"`. USD only today, matching the access model's `Currency`. */
export function formatCents(cents: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
