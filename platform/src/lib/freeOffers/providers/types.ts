/**
 * Contract for a store-specific free-game ingestion adapter.
 *
 * Each adapter fetches currently available free offers from its store and
 * returns a normalized list. The ingestion engine handles matching, dedup,
 * and persistence — adapters just fetch and normalize.
 */

import type { OfferType, StoreSlug } from "../types";

/** A single discovered offer, before matching / dedup. */
export interface DiscoveredOffer {
  /** Store-specific unique identifier (Epic offer id, Steam appid, etc.). */
  externalId: string;
  /** Game title as listed in the store. */
  title: string;
  store: StoreSlug;
  offerType: OfferType;
  startDate: Date | null;
  endDate: Date | null;
  /** Direct link to claim / add to library. */
  claimUrl: string;
  /** Product page URL. */
  storeUrl: string;
  coverImage: string | null;
  description: string | null;
  developer: string | null;
  publisher: string | null;
  platforms: string[];
  /** Formatted original price, e.g. "$29.99". */
  retailPrice: string | null;
  /** Price in cents for sorting. */
  retailPriceValue: number | null;
  currency: string | null;
  isBaseGame: boolean;
  /** Trailer / gameplay video URLs. */
  videos: string[];
  /** For Prime Gaming: which platform the key redeems on. */
  redemptionPlatform: string | null;
  /** Extra store-specific data. */
  metadata: Record<string, unknown>;
}

export interface StoreProviderAdapter {
  /** Which store this adapter serves. */
  readonly store: StoreSlug;
  /** A fully verified empty response may retire this provider's old offers. */
  readonly canExpireEmptyBatch?: boolean;
  /**
   * Fetch all currently active free offers.
   * Throw on fetch/parse failures so ingestion preserves existing offers.
   */
  fetchCurrentOffers(): Promise<DiscoveredOffer[]>;
}
