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
import StoreProviderModel from "@/lib/models/StoreProvider";
import type { FreeOfferRecord, StoreProviderRecord, StoreSlug } from "./types";

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

function toProviderRecord(doc: LeanDoc): StoreProviderRecord {
  return {
    slug: doc.slug as StoreSlug,
    name: String(doc.name),
    logoUrl: (doc.logoUrl as string) || null,
    baseUrl: String(doc.baseUrl),
    color: (doc.color as string) || null,
    active: doc.active !== false,
  };
}

// ── Raw queries (uncached, for ingestion) ────────────────────────────────

async function queryActiveOffers(store?: StoreSlug): Promise<FreeOfferRecord[]> {
  await dbConnect();
  const filter: Record<string, unknown> = { isActive: true };
  if (store) filter.store = store;
  const docs = await FreeOffer.find(filter)
    .sort({ endDate: 1, store: 1, createdAt: -1 })
    .lean();
  return docs.map((d) => toRecord(d as LeanDoc));
}

async function queryRecentlyExpired(days: number): Promise<FreeOfferRecord[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  await dbConnect();
  const docs = await FreeOffer.find({
    isActive: false,
    endDate: { $gte: since },
  })
    .sort({ endDate: -1 })
    .lean();
  return docs.map((d) => toRecord(d as LeanDoc));
}

async function queryOffersForGame(gameSlug: string): Promise<FreeOfferRecord[]> {
  await dbConnect();
  const docs = await FreeOffer.find({ gameSlug })
    .sort({ startDate: -1 })
    .lean();
  return docs.map((d) => toRecord(d as LeanDoc));
}

async function queryUnmatched(): Promise<FreeOfferRecord[]> {
  await dbConnect();
  const docs = await FreeOffer.find({
    $or: [
      { matchConfidence: "unmatched" },
      { matchConfidence: "low" },
    ],
    isActive: true,
  })
    .sort({ store: 1, unmatchedTitle: 1 })
    .lean();
  return docs.map((d) => toRecord(d as LeanDoc));
}

async function queryProviders(): Promise<StoreProviderRecord[]> {
  await dbConnect();
  const docs = await StoreProviderModel.find().sort({ slug: 1 }).lean();
  return docs.map((d) => toProviderRecord(d as LeanDoc));
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

/**
 * Only active offers for a game. Convenience filter over offersForGame.
 */
export async function activeOffersForGame(gameSlug: string): Promise<FreeOfferRecord[]> {
  const all = await offersForGame(gameSlug);
  return all.filter((o) => o.isActive);
}

/**
 * Offers that couldn't be matched to the catalog — for admin review.
 */
export async function listUnmatchedOffers(): Promise<FreeOfferRecord[]> {
  return queryUnmatched();
}

/**
 * All configured store providers.
 */
export const getStoreProviders = cache(
  async (): Promise<StoreProviderRecord[]> =>
    unstable_cache(
      () => queryProviders(),
      ["store-providers"],
      { revalidate: 3600, tags: ["free-offers"] }
    )()
);

/**
 * Count of currently active offers — for homepage conditional rendering.
 */
export async function activeOfferCount(): Promise<number> {
  const offers = await listActiveOffers();
  return offers.length;
}
