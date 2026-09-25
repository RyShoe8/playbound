/**
 * Core query layer for free offers.
 *
 * All public queries are cached via unstable_cache with the "free-offers" tag
 * so ingestion can bust the cache on write. Pages import from here rather
 * than touching the model directly.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import FreeOffer from "@/lib/models/FreeOffer";
import { seedFreeOffers } from "@/lib/data/freeOffers";
import { inferGameGenres } from "@/lib/dealsShared";
import { type FreeOfferRecord, type StoreSlug } from "./types";

// ── Mappers ──────────────────────────────────────────────────────────────

type LeanDoc = Record<string, unknown>;

function toRecord(doc: LeanDoc): FreeOfferRecord {
  return {
    id: String(doc._id),
    gameId: doc.gameId ? String(doc.gameId) : null,
    gameSlug: (doc.gameSlug as string) || null,
    unmatchedTitle: (doc.unmatchedTitle as string) || null,
    store: doc.store as StoreSlug,
    offerType: doc.offerType as FreeOfferRecord["offerType"],
    startDate: doc.startDate ? new Date(doc.startDate as string).toISOString() : null,
    endDate: doc.endDate ? new Date(doc.endDate as string).toISOString() : null,
    claimUrl: String(doc.claimUrl),
    storeUrl: (doc.storeUrl as string) || null,
    isActive: Boolean(doc.isActive),
    lastVerified: doc.lastVerified
      ? new Date(doc.lastVerified as string).toISOString()
      : new Date().toISOString(),
    source: (doc.source as string) || null,
    externalId: String(doc.externalId),
    retailPrice: (doc.retailPrice as string) || null,
    retailPriceValue: (doc.retailPriceValue as number) ?? null,
    currency: (doc.currency as string) || null,
    coverImage: (doc.coverImage as string) || null,
    description: (doc.description as string) || null,
    developer: (doc.developer as string) || null,
    publisher: (doc.publisher as string) || null,
    platforms: (doc.platforms as string[]) ?? [],
    genres: inferGameGenres(
      (doc.unmatchedTitle as string) ||
        ((doc.metadata as Record<string, unknown> | undefined)?.title as string) ||
        (doc.gameSlug as string) ||
        "",
      (doc.genres as string[]) ?? []
    ),
    isBaseGame: doc.isBaseGame !== false,
    videos: (doc.videos as string[]) ?? [],
    redemptionPlatform: (doc.redemptionPlatform as string) || null,
    matchConfidence: (doc.matchConfidence as FreeOfferRecord["matchConfidence"]) || "unmatched",
    featured: Boolean(doc.featured),
    editorialNote: (doc.editorialNote as string) || null,
    qualityScore: (doc.qualityScore as number) ?? null,
    metadata: (doc.metadata as Record<string, unknown>) ?? {},
    createdAt: doc.createdAt
      ? new Date(doc.createdAt as string).toISOString()
      : new Date().toISOString(),
    updatedAt: doc.updatedAt
      ? new Date(doc.updatedAt as string).toISOString()
      : new Date().toISOString(),
  };
}

// ── Raw queries (uncached, for ingestion) ────────────────────────────────

async function queryActiveOffers(store?: StoreSlug): Promise<FreeOfferRecord[]> {
  try {
    await dbConnect();
    const filter: Record<string, unknown> = { isActive: true };
    if (store) filter.store = store;
    const docs = await FreeOffer.find(filter)
      .sort({ endDate: 1, store: 1, createdAt: -1 })
      .lean();
    if (docs.length > 0) {
      return docs.map((d) => toRecord(d as LeanDoc));
    }
  } catch (err) {
    console.error("[freeOffers] queryActiveOffers failed, using seed fallback:", err);
  }
  return seedFreeOffers.filter((o) => (store ? o.store === store : true) && o.isActive);
}

async function queryRecentlyExpired(days: number): Promise<FreeOfferRecord[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    await dbConnect();
    const docs = await FreeOffer.find({
      isActive: false,
      endDate: { $gte: since },
    })
      .sort({ endDate: -1 })
      .lean();
    if (docs.length > 0) {
      return docs.map((d) => toRecord(d as LeanDoc));
    }
  } catch (err) {
    console.error("[freeOffers] queryRecentlyExpired failed:", err);
  }
  return [];
}

async function queryOffersForGame(gameSlug: string): Promise<FreeOfferRecord[]> {
  try {
    await dbConnect();
    const docs = await FreeOffer.find({ gameSlug })
      .sort({ startDate: -1 })
      .lean();
    if (docs.length > 0) {
      return docs.map((d) => toRecord(d as LeanDoc));
    }
  } catch (err) {
    console.error("[freeOffers] queryOffersForGame failed:", err);
  }
  return seedFreeOffers.filter((o) => o.gameSlug === gameSlug);
}

// ── Cached public queries ────────────────────────────────────────────────

/**
 * Currently active free offers, optionally filtered by store.
 * Cached for 5 minutes, busted by ingestion.
 */
export const listActiveOffers = cache(
  async (store?: StoreSlug): Promise<FreeOfferRecord[]> =>
    unstable_cache(
      () => queryActiveOffers(store),
      ["free-offers", "active", store ?? "all"],
      { revalidate: 300, tags: ["free-offers"] }
    )()
);

/**
 * Recently expired offers for the "Recently Free" section.
 * Defaults to last 30 days.
 */
export const listRecentlyExpiredOffers = cache(
  async (days = 30): Promise<FreeOfferRecord[]> =>
    unstable_cache(
      () => queryRecentlyExpired(days),
      ["free-offers", "recently-expired", String(days)],
      { revalidate: 900, tags: ["free-offers"] }
    )()
);

/**
 * All offers (active + historical) for a specific game.
 * Used on game detail pages.
 */
export async function offersForGame(gameSlug: string): Promise<FreeOfferRecord[]> {
  return unstable_cache(
    () => queryOffersForGame(gameSlug),
    ["free-offers", "game", gameSlug],
    { revalidate: 300, tags: ["free-offers"] }
  )();
}
