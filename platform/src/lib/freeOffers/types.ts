/**
 * Shared types for the free-games aggregation system.
 *
 * Every module in src/lib/freeOffers/ imports from here rather than reaching
 * into Mongoose schemas — keeps the boundary clean and testable.
 */

// ── Store slugs ──────────────────────────────────────────────────────────
export const STORE_SLUGS = ["epic", "steam", "gog", "prime_gaming"] as const;
export type StoreSlug = (typeof STORE_SLUGS)[number];

export function isStoreSlug(value: unknown): value is StoreSlug {
  return typeof value === "string" && (STORE_SLUGS as readonly string[]).includes(value);
}

// ── Offer types ──────────────────────────────────────────────────────────
export const OFFER_TYPES = [
  "free_to_keep",
  "free_weekend",
  "free_trial",
  "free_with_subscription",
] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export function isOfferType(value: unknown): value is OfferType {
  return typeof value === "string" && (OFFER_TYPES as readonly string[]).includes(value);
}

// ── Match confidence ─────────────────────────────────────────────────────
export const MATCH_CONFIDENCE = ["exact", "high", "low", "unmatched"] as const;
export type MatchConfidence = (typeof MATCH_CONFIDENCE)[number];

// ── Records (plain objects, no Mongoose) ─────────────────────────────────

/** A free offer as exposed to the service/UI layer. */
export interface FreeOfferRecord {
  id: string;
  gameId: string | null;
  gameSlug: string | null;
  unmatchedTitle: string | null;
  store: StoreSlug;
  offerType: OfferType;
  startDate: string | null;
  endDate: string | null;
  claimUrl: string;
  storeUrl: string | null;
  isActive: boolean;
  lastVerified: string;
  source: string | null;
  externalId: string;
  retailPrice: string | null;
  retailPriceValue: number | null;
  currency: string | null;
  coverImage: string | null;
  description: string | null;
  developer: string | null;
  publisher: string | null;
  platforms: string[];
  isBaseGame: boolean;
  videos: string[];
  redemptionPlatform: string | null;
  matchConfidence: MatchConfidence;
  featured: boolean;
  editorialNote: string | null;
  qualityScore: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Store provider config as exposed to the UI. */
export interface StoreProviderRecord {
  slug: StoreSlug;
  name: string;
  logoUrl: string | null;
  baseUrl: string;
  color: string | null;
  active: boolean;
}

/** Summary returned by the ingestion pipeline. */
export interface IngestionResult {
  provider: StoreSlug;
  status: "success" | "partial" | "failed";
  offersFound: number;
  offersCreated: number;
  offersUpdated: number;
  offersExpired: number;
  gamesMatched: number;
  gamesCreated: number;
  gamesUnmatched: number;
  error?: string;
  durationMs: number;
}
