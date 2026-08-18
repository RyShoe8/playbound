/**
 * Match a catalog game to store products and write unique hits.
 *
 * Auto-write only when one listing clearly is the game. Ambiguous results
 * become a suggestion. Existing or manual purchase sources are left alone.
 */

import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import StoreMatchSuggestion from "@/lib/models/StoreMatchSuggestion";
import StoreProvider from "@/lib/models/StoreProvider";
import { bestPurchase, offersFromUnknown } from "@/lib/access/offers";
import type { RetailOffer } from "@/lib/access/types";
import { lookupStorePrice } from "@/lib/access/storePrices";
import { searchStoreCatalog, scoreTitleMatch, type StoreSearchHit } from "./storeSearch";
import { ensureCommerceStores } from "./ensureStores";
import {
  STORE_CAPABILITIES,
  storeSlugToRetailer,
  type CommerceStoreSlug,
} from "./stores";

export type MatchSource = "auto" | "manual";

type LeanGame = {
  _id: unknown;
  slug: string;
  title: string;
  developerSlug?: string;
  releaseYear?: number;
  steamAppId?: string | null;
  epicStoreUrl?: string | null;
  gogStoreUrl?: string | null;
  aliases?: string[];
  externalIds?: { steam?: string | null; epic?: string | null; gog?: string | null };
  access?: {
    priceType?: string;
    offers?: unknown;
    regularPriceCents?: number | null;
    currentPriceCents?: number | null;
    qualifyingPriceCents?: number | null;
  };
};

export type StoreMatchSummary = {
  slug: string;
  applied: number;
  suggested: number;
  skipped: number;
  idsWritten: number;
};

function retailerOnGame(offers: RetailOffer[], retailer: string): boolean {
  return offers.some((o) => o.retailer.toLowerCase() === retailer.toLowerCase());
}

function existingUrl(game: LeanGame, store: CommerceStoreSlug): string | null {
  if (store === "steam") {
    const id = game.steamAppId || game.externalIds?.steam;
    return id ? `https://store.steampowered.com/app/${id}` : null;
  }
  if (store === "epic") return game.epicStoreUrl || null;
  if (store === "gog") return game.gogStoreUrl || null;
  return null;
}

export function pickUniqueHit(gameTitle: string, hits: StoreSearchHit[]): StoreSearchHit | null {
  if (hits.length === 0) return null;
  const exact = hits.filter((h) => scoreTitleMatch(gameTitle, h.title) >= 100);
  if (exact.length === 1) return exact[0];
  if (hits.length === 1 && scoreTitleMatch(gameTitle, hits[0].title) >= 80) return hits[0];
  return null;
}

function idsFromHit(hit: StoreSearchHit): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  if (hit.store === "steam") {
    set.steamAppId = hit.externalId;
    set["externalIds.steam"] = hit.externalId;
  }
  if (hit.store === "epic") {
    set.epicStoreUrl = hit.url;
    set["externalIds.epic"] = hit.externalId;
  }
  if (hit.store === "gog") {
    set.gogStoreUrl = hit.url;
    set["externalIds.gog"] = hit.externalId;
  }
  return set;
}

export async function applyStoreHit(opts: {
  slug: string;
  hit: StoreSearchHit;
  matchSource: MatchSource;
  writeOffer: boolean;
  affiliate?: boolean;
}): Promise<{ wroteOffer: boolean; wroteIds: boolean }> {
  await dbConnect();
  const game = (await CatalogGame.findOne({ slug: opts.slug }).lean()) as LeanGame | null;
  if (!game) return { wroteOffer: false, wroteIds: false };

  const $set: Record<string, unknown> = idsFromHit(opts.hit);
  const wroteIds = Object.keys($set).length > 0;
  let wroteOffer = false;

  if (opts.writeOffer && opts.hit.priceCents && opts.hit.priceCents > 0) {
    const offers = offersFromUnknown(game.access?.offers);
    if (!retailerOnGame(offers, opts.hit.retailer)) {
      let priceCents = opts.hit.priceCents;
      let listPriceCents = opts.hit.listPriceCents;
      let url = opts.hit.url;
      try {
        const live = await lookupStorePrice(opts.hit.url);
        priceCents = live.priceCents;
        listPriceCents = live.listPriceCents ?? listPriceCents;
        url = live.url || url;
      } catch {
        // Feed rows and stores without live lookup keep the ingested price.
      }
      const next: RetailOffer[] = [
        ...offers,
        {
          retailer: opts.hit.retailer,
          url,
          priceCents,
          affiliate: opts.affiliate !== false,
          lastCheckedAt: new Date().toISOString(),
          isActive: true,
          matchSource: opts.matchSource,
        },
      ];
      const derived = bestPurchase({
        priceType: "PAID",
        regularPriceCents: game.access?.regularPriceCents ?? listPriceCents ?? priceCents,
        currentPriceCents: game.access?.currentPriceCents ?? null,
        qualifyingPriceCents: game.access?.qualifyingPriceCents ?? listPriceCents ?? priceCents,
        currency: "USD",
        purchaseRequired: true,
        offers: next,
      });
      $set["access.offers"] = next;
      $set["access.currentPriceCents"] = derived?.priceCents ?? priceCents;
      if (!game.access?.regularPriceCents) {
        $set["access.regularPriceCents"] = listPriceCents ?? priceCents;
      }
      if (!game.access?.qualifyingPriceCents) {
        $set["access.qualifyingPriceCents"] = listPriceCents ?? priceCents;
      }
      wroteOffer = true;
    }
  }

  if (Object.keys($set).length === 0) return { wroteOffer: false, wroteIds: false };
  await CatalogGame.updateOne({ slug: opts.slug }, { $set });
  return { wroteOffer, wroteIds };
}

async function enabledStores(): Promise<
  Array<{ slug: CommerceStoreSlug; affiliateDefault: boolean }>
> {
  const docs = await StoreProvider.find({ matchingEnabled: true }).lean();
  const out: Array<{ slug: CommerceStoreSlug; affiliateDefault: boolean }> = [];
  for (const doc of docs) {
    const slug = doc.slug as CommerceStoreSlug;
    if (!STORE_CAPABILITIES[slug]) continue;
    if (!STORE_CAPABILITIES[slug].retailer && !STORE_CAPABILITIES[slug].titleSearch) continue;
    out.push({ slug, affiliateDefault: doc.affiliateDefault !== false });
  }
  return out;
}

async function suggest(game: LeanGame, hitList: StoreSearchHit[], store: CommerceStoreSlug) {
  const retailer = storeSlugToRetailer(store);
  if (!retailer || hitList.length === 0) return;
  await StoreMatchSuggestion.findOneAndUpdate(
    { gameSlug: game.slug, store, status: "pending" },
    {
      $set: {
        gameTitle: game.title,
        retailer,
        candidates: hitList.slice(0, 6).map((h) => ({
          title: h.title,
          url: h.url,
          externalId: h.externalId,
          priceCents: h.priceCents,
          listPriceCents: h.listPriceCents,
        })),
        status: "pending",
      },
    },
    { upsert: true }
  );
}

export async function matchGameToStores(
  slug: string,
  opts: { stores?: CommerceStoreSlug[] } = {}
): Promise<StoreMatchSummary> {
  await dbConnect();
  await ensureCommerceStores();
  const game = (await CatalogGame.findOne({ slug }).lean()) as LeanGame | null;
  const summary: StoreMatchSummary = { slug, applied: 0, suggested: 0, skipped: 0, idsWritten: 0 };
  if (!game) return summary;

  const paid = game.access?.priceType === "PAID";
  const offers = offersFromUnknown(game.access?.offers);
  const stores = opts.stores ?? (await enabledStores()).map((s) => s.slug);
  const affiliates = new Map((await enabledStores()).map((s) => [s.slug, s.affiliateDefault]));

  for (const store of stores) {
    const retailer = storeSlugToRetailer(store);
    const caps = STORE_CAPABILITIES[store];
    if (!caps || (!caps.titleSearch && !caps.feedIngest)) {
      summary.skipped += 1;
      continue;
    }
    if (retailer && retailerOnGame(offers, retailer)) {
      summary.skipped += 1;
      continue;
    }

    let hits: StoreSearchHit[] = [];
    const knownUrl = existingUrl(game, store);
    if (knownUrl && retailer) {
      try {
        const live = await lookupStorePrice(knownUrl);
        hits = [
          {
            store,
            retailer,
            title: game.title,
            url: live.url,
            externalId:
              store === "steam"
                ? game.steamAppId || game.externalIds?.steam || ""
                : store === "gog"
                  ? game.externalIds?.gog || ""
                  : game.externalIds?.epic || "",
            priceCents: live.priceCents,
            listPriceCents: live.listPriceCents,
          },
        ];
      } catch {
        hits = [];
      }
    }
    if (hits.length === 0) {
      hits = await searchStoreCatalog(store, game.title);
    }
    if (hits.length === 0 && game.aliases?.[0]) {
      hits = await searchStoreCatalog(store, game.aliases[0]);
    }

    const unique = pickUniqueHit(game.title, hits);
    if (unique) {
      const result = await applyStoreHit({
        slug: game.slug,
        hit: unique,
        matchSource: "auto",
        writeOffer: paid,
        affiliate: affiliates.get(store) !== false,
      });
      if (result.wroteOffer) summary.applied += 1;
      if (result.wroteIds) summary.idsWritten += 1;
      if (!result.wroteOffer && !result.wroteIds) summary.skipped += 1;
      continue;
    }
    if (hits.length > 0 && retailer) {
      await suggest(game, hits, store);
      summary.suggested += 1;
      continue;
    }
    summary.skipped += 1;
  }

  return summary;
}

export async function matchCatalogBatch(opts: { limit?: number } = {}): Promise<{
  games: number;
  applied: number;
  suggested: number;
  skipped: number;
}> {
  await dbConnect();
  await ensureCommerceStores();
  const limit = opts.limit ?? 15;
  const games = await CatalogGame.find({
    $or: [
      { "access.priceType": "PAID", "access.offers.0": { $exists: false } },
      { "access.priceType": "PAID", "access.offers": { $size: 0 } },
    ],
  })
    .select("slug")
    .limit(limit)
    .lean();

  const totals = { games: games.length, applied: 0, suggested: 0, skipped: 0 };
  for (const game of games) {
    const row = await matchGameToStores(String(game.slug));
    totals.applied += row.applied;
    totals.suggested += row.suggested;
    totals.skipped += row.skipped;
  }
  return totals;
}
