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
 * 75% is deliberately demanding — verified live against real store prices
 * during design, seasonal GOG/Steam sales reach it comfortably on a real
 * slice of a store's catalog, so this is a bar a store-wide scan can actually
 * clear on a normal day, not just during a single mega-sale.
 *
 * A constant, not a literal, because it is a curation judgement someone will
 * want to revisit, and because it is shared by three call sites that must
 * agree: the page copy, `storeDiscounts/ingestion.ts` (what a provider even
 * bothers fetching), and `listDiscountedGames()`'s own read-time filter.
 */
export const DEEP_DISCOUNT_MIN_PERCENT = 75;

export type DiscountedGame = {
  /**
   * Null for the overwhelming majority of rows. These are store-wide finds,
   * independent of PlayBound's own catalog — see `matchedGameSlug` on the
   * `StoreDiscount` model. A slug here means an optional, best-effort
   * enrichment happened to find a match; nothing requires or expects one.
   */
  slug: string | null;
  title: string;
  tagline: string | null;
  coverImage: string | null;
  /** Null for an unmatched store find — no curated hue exists for it. Card/list fall back to one shared gradient. */
  art: Game["art"] | null;
  genres: string[];
  regularPriceCents: Cents;
  currentPriceCents: Cents;
  currency: string;
  /** Whole percent off, rounded down so we never overstate a discount. */
  percentOff: number;
  storeName: string | null;
  storeUrl: string | null;
  /**
   * Stable key for the store filter, shared with free offers.
   *
   * Both halves of /deals now key on the same `StoreSlug`/`DiscountStoreSlug`
   * values directly ("gog", "steam", "epic", …) — there is no retailer
   * display-name string to normalise any more, since discounts come from a
   * typed provider rather than a free-text `access.offers[].retailer` field.
   */
  storeKey: string | null;
};

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

/**
 * Clean up raw titles from storefront feeds and aggregators.
 *
 * Fixes:
 * - Underscore-separated words like "Watch_Dogs 2" → "Watch Dogs 2"
 * - Redundant trademark / copyright glyphs: ®, ™, ©, &trade;, &reg;
 * - HTML entities: &amp;, &#39;, &quot;, &apos;
 * - Multiple consecutive spaces
 */
export function cleanDealTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&trade;/gi, "")
    .replace(/&reg;/gi, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[\u00AE\u2122\u00A9]/g, "") // ® ™ ©
    .replace(/_/g, " ") // e.g. "Watch_Dogs 2" → "Watch Dogs 2"
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Upgrades low-res store thumbnails (e.g. Steam capsule_231x87) to full-size header images.
 * Also constructs a high-res Steam header image when a steamAppID is present.
 */
export function upgradeCoverImage(
  coverImage: string | null | undefined,
  steamAppId?: string | null
): string | null {
  if (steamAppId && /^\d+$/.test(String(steamAppId).trim())) {
    return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${String(steamAppId).trim()}/header.jpg`;
  }
  if (!coverImage) return null;
  const trimmed = coverImage.trim();
  if (!trimmed) return null;

  // Upgrade low-res Steam capsule thumbnails to full header.jpg
  if (/steamstatic\.com/i.test(trimmed)) {
    const upgraded = trimmed.replace(/\/capsule_\d+x\d+[^.]*\.jpg/i, "/header.jpg");
    if (upgraded !== trimmed) return upgraded;
  }

  return trimmed;
}
