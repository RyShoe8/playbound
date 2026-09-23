import type { Game } from "@/lib/data/types";
import type { Cents } from "@/lib/access/types";

/**
 * The parts of /deals that a client component may import.
 *
 * Split out of `lib/deals.ts` because that module imports `lib/catalog`, which
 * reaches `lib/developers` and its `cacheLife` call — a Server-Components-only
 * API. The moment `DiscountedGameCard` was rendered inside the client-side
 * `DealsBrowser`, that whole chain was pulled into the browser bundle and the
 * route failed to compile.
 *
 * So the rule this file exists to enforce: **nothing here may import anything
 * that touches the database, the cache APIs, or `next/*` server modules.** Types
 * are fine — they erase. `lib/deals.ts` re-exports everything below, so server
 * callers can keep importing from one place.
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
  /**
   * Stable key for the store filter, shared with free offers.
   *
   * Free offers identify their store with a `StoreSlug`; discounts carry a
   * retailer *display name* from the offer row ("GOG", "Epic Games Store").
   * Filtering /deals by store needs one vocabulary across both, so retailer
   * names normalise onto the StoreSlug values where they overlap — otherwise a
   * GOG giveaway and a GOG discount would land in two different buckets and the
   * store filter would look broken.
   */
  storeKey: string | null;
};

/**
 * Retailer display name → the key the store filter groups on.
 *
 * Aligned with `StoreSlug` for the three storefronts that appear on both sides
 * of the page. Anything else is slugified rather than dropped: Fanatical and
 * Humble can carry a discount even though they never run the giveaways we
 * track, and silently hiding those from the filter would hide real deals.
 */
export function dealStoreKey(retailer: string | null | undefined): string | null {
  const name = (retailer ?? "").trim();
  if (!name) return null;
  const known: Record<string, string> = {
    gog: "gog",
    steam: "steam",
    "epic games store": "epic",
    epic: "epic",
  };
  const lower = name.toLowerCase();
  if (known[lower]) return known[lower];
  const slug = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // A retailer name of pure punctuation slugifies to "" — that is no key at all,
  // not a key named empty string, or it would swallow every other store.
  return slug || null;
}

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

/** `599` → `"$5.99"`. USD only today, matching the access model's `Currency`. */
export function formatCents(cents: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
