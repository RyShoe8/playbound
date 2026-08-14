/**
 * Amazon Prime Gaming ingestion adapter.
 *
 * No stable public API exists for Prime Gaming. This adapter provides:
 *   - The interface and architecture for future automated ingestion
 *   - Correct typing (always free_with_subscription)
 *   - Redemption platform tracking for cross-platform offers
 *
 * For now, it returns an empty list. Prime Gaming offers can be ingested
 * through other means (manual entry through admin, newsletter builder,
 * or a future scraping/API integration).
 *
 * When a reliable source is identified, only this file needs to change.
 */

import type { StoreProviderAdapter, DiscoveredOffer } from "./types";

export class PrimeGamingProviderAdapter implements StoreProviderAdapter {
  readonly store = "prime_gaming" as const;

  async fetchCurrentOffers(): Promise<DiscoveredOffer[]> {
    // Prime Gaming has no stable public API for programmatic ingestion.
    // This adapter is wired into the system so that:
    //   1. Offers manually created with store="prime_gaming" work correctly
    //   2. The UI and ingestion engine handle prime_gaming offers natively
    //   3. When an API source is found, this is the only file to update
    //
    // Returning [] is safe — the ingestion engine never erases existing
    // offers when a provider returns zero results.

    return [];
  }
}

/**
 * Helper for manually constructing a Prime Gaming offer.
 * Used by admin APIs and newsletter integration.
 */
export function buildPrimeGamingOffer(opts: {
  title: string;
  claimUrl: string;
  storeUrl?: string;
  coverImage?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  developer?: string;
  publisher?: string;
  platforms?: string[];
  /** Platform the key redeems on: "epic", "gog", "amazon_games", etc. */
  redemptionPlatform?: string;
}): DiscoveredOffer {
  // Use a slugified title as the external ID for manual entries.
  const externalId = `prime-${opts.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

  return {
    externalId,
    title: opts.title,
    store: "prime_gaming",
    offerType: "free_with_subscription",
    startDate: opts.startDate ?? null,
    endDate: opts.endDate ?? null,
    claimUrl: opts.claimUrl,
    storeUrl: opts.storeUrl ?? opts.claimUrl,
    coverImage: opts.coverImage ?? null,
    description: opts.description ?? null,
    developer: opts.developer ?? null,
    publisher: opts.publisher ?? null,
    platforms: opts.platforms ?? ["Windows"],
    retailPrice: null,
    retailPriceValue: null,
    currency: null,
    isBaseGame: true,
    videos: [],
    redemptionPlatform: opts.redemptionPlatform ?? null,
    metadata: { manualEntry: true },
  };
}
