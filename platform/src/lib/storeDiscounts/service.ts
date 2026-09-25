/**
 * Core query layer for store-wide discounts.
 *
 * Mirrors `src/lib/freeOffers/service.ts`'s shape: reads are cached via
 * `unstable_cache` with the `"store-discounts"` tag, busted by
 * `storeDiscounts/ingestion.ts` on write.
 *
 * This is also where affiliate stamping happens — once, here, at read time —
 * so `DiscountedGameCard` stays a dumb renderer that never has to know a
 * `StoreProvider` document exists. See the account's live GamersGate program
 * for why this matters: a URL built here is what actually gets clicked.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import StoreDiscount from "@/lib/models/StoreDiscount";
import { getStoreAffiliateMap } from "@/lib/commerce/affiliates";
import { storeSlugToRetailer } from "@/lib/commerce/stores";
import { withStoreAffiliate } from "@/lib/access/storeUrls";
import { withOutboundUtm } from "@/lib/utm";
import {
  cleanDealTitle,
  upgradeCoverImage,
  inferGameGenres,
  type DiscountedGame,
} from "@/lib/dealsShared";
import { type DiscountStoreSlug } from "./types";

type LeanDoc = Record<string, unknown>;

/**
 * Apply UTM + our own affiliate stamp to a store link.
 *
 * `directUrlAvailable` (set by the provider, e.g. `cheapshark.ts`) gates the
 * affiliate step specifically: a `false` value means the URL is not actually
 * on that store's own domain (today, only Epic via CheapShark's redirect) —
 * `withStoreAffiliate`'s query-param stamp would attach our credential to the
 * wrong domain, and its template branch would double-wrap a URL that is
 * already somebody else's redirect. UTM tagging is harmless either way, since
 * it is only for our own outbound-click analytics.
 */
/** Exported for storeDiscounts/service.test.ts — this is the affiliate-safety logic. */
export function buildStoreUrl(
  rawUrl: string,
  store: DiscountStoreSlug,
  directUrlAvailable: boolean,
  affiliates: Awaited<ReturnType<typeof getStoreAffiliateMap>>
): string {
  const withUtm = withOutboundUtm(rawUrl, { campaign: "deals_discount" });
  if (!directUrlAvailable) return withUtm;

  const retailer = storeSlugToRetailer(store);
  const stamp = retailer ? affiliates[retailer] : undefined;
  return withStoreAffiliate(withUtm, {
    affiliate: true,
    id: stamp?.id,
    param: stamp?.param,
    template: stamp?.template,
  });
}

async function toRecord(
  doc: LeanDoc,
  affiliates: Awaited<ReturnType<typeof getStoreAffiliateMap>>
): Promise<DiscountedGame> {
  const store = doc.store as DiscountStoreSlug;
  const directUrlAvailable = (doc.metadata as Record<string, unknown> | undefined)?.directUrlAvailable !== false;
  const rawCover = (doc.coverImage as string) || null;
  const steamAppId = (doc.metadata as Record<string, unknown> | undefined)?.steamAppID as string | undefined;
  const cleanTitle = cleanDealTitle(String(doc.title));
  const rawEndDate = doc.endDate || (doc.metadata as Record<string, unknown> | undefined)?.endDate;

  return {
    slug: (doc.matchedGameSlug as string) || null,
    title: cleanTitle,
    tagline: null,
    coverImage: upgradeCoverImage(rawCover, steamAppId),
    art: null,
    genres: inferGameGenres(cleanTitle, doc.genres as string[]),
    regularPriceCents: Number(doc.regularPriceCents),
    currentPriceCents: Number(doc.currentPriceCents),
    currency: (doc.currency as string) || "USD",
    percentOff: Number(doc.percentOff),
    storeName: storeSlugToRetailer(store),
    storeUrl: buildStoreUrl(String(doc.storeUrl), store, directUrlAvailable, affiliates),
    storeKey: store,
    endDate: rawEndDate ? new Date(rawEndDate as string).toISOString() : null,
  };
}

async function queryActiveDiscounts(): Promise<DiscountedGame[]> {
  /*
   * No seed fallback the way freeOffers/service.ts has one — there is no
   * curated "sample discount" to fall back to, and inventing one would be
   * exactly the kind of fabricated deal this feature exists to avoid. An
   * unreachable database means "unknown", which reads honestly as "nothing
   * to show" rather than as a crashed page — same reasoning as
   * project-local-dev-no-mongo: this is expected locally, not a bug.
   */
  try {
    await dbConnect();
    const [docs, affiliates] = await Promise.all([
      StoreDiscount.find({ isActive: true }).sort({ percentOff: -1, createdAt: -1 }).lean(),
      getStoreAffiliateMap(),
    ]);
    return await Promise.all(docs.map((d) => toRecord(d as LeanDoc, affiliates)));
  } catch (err) {
    console.error("[storeDiscounts] queryActiveDiscounts failed:", err);
    return [];
  }
}

/**
 * Currently active store-wide discounts, deepest first.
 * Cached for 5 minutes, busted by ingestion — same cadence as free offers.
 */
export const listActiveDiscounts = cache(
  async (): Promise<DiscountedGame[]> =>
    unstable_cache(queryActiveDiscounts, ["store-discounts", "active"], {
      revalidate: 300,
      tags: ["store-discounts"],
    })()
);

;
export type { DiscountStoreSlug };
