/**
 * Shared types for the store-wide discount scanner.
 *
 * Mirrors `src/lib/freeOffers/types.ts`'s split deliberately: `DiscoveredDiscount`
 * is what a provider adapter returns (no database, no catalog awareness),
 * `StoreDiscountRecord` is what the service layer serves to pages (a plain,
 * JSON-safe object mirroring the Mongo doc).
 */

/**
 * Stores this scanner covers today.
 *
 * A deliberately small subset of `CommerceStoreSlug` — see
 * `STORE_CAPABILITIES[x].discountScan` in `src/lib/commerce/stores.ts` for why
 * each of the others is excluded or deferred. Kept in sync with the
 * `StoreDiscount` model's `store` enum by
 * `src/lib/storeDiscounts/storeScope.test.ts`.
 */
export const DISCOUNT_STORE_SLUGS = ["gog", "steam", "epic", "gamersgate"] as const;
export type DiscountStoreSlug = (typeof DISCOUNT_STORE_SLUGS)[number];

/** What a provider adapter returns — pre-persistence, no catalog matching. */
export interface DiscoveredDiscount {
  /** Store-specific ID: GOG product id, or CheapShark's dealID. */
  externalId: string;
  title: string;
  store: DiscountStoreSlug;
  /** Direct product page. Never a third party's affiliate redirect — see providers/*.ts. */
  storeUrl: string;
  coverImage: string | null;
  genres: string[];
  developers: string[];
  platforms: string[];
  currency: string;
  regularPriceCents: number;
  currentPriceCents: number;
  /** Extra provider-specific data that doesn't fit a typed field. */
  metadata: Record<string, unknown>;
}

/** A discount as exposed to the service/UI layer. */
export interface StoreDiscountRecord {
  id: string;
  store: DiscountStoreSlug;
  externalId: string;
  title: string;
  storeUrl: string;
  coverImage: string | null;
  genres: string[];
  developers: string[];
  platforms: string[];
  currency: string;
  regularPriceCents: number;
  currentPriceCents: number;
  percentOff: number;
  matchedGameSlug: string | null;
  isActive: boolean;
  lastVerified: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Summary returned by the ingestion pipeline. Mirrors IngestionResult's shape. */
export interface DiscountIngestionResult {
  provider: DiscountStoreSlug;
  status: "success" | "partial" | "failed";
  discountsFound: number;
  discountsCreated: number;
  discountsUpdated: number;
  discountsExpired: number;
  error?: string;
  durationMs: number;
}

/** Contract every store-discount adapter implements. */
export interface DiscountProviderAdapter {
  readonly store: DiscountStoreSlug;
  /**
   * Fetch currently discounted titles at or above `minPercentOff`.
   * Must not throw on a transient failure at the per-item level — only a
   * total fetch failure should throw, so ingestion can tell "the store is down"
   * from "nothing met the bar this time".
   */
  fetchDiscounts(minPercentOff: number): Promise<DiscoveredDiscount[]>;
}
