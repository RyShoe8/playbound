import dbConnect from "@/lib/db";
import StoreProvider from "@/lib/models/StoreProvider";
import { SEED_COMMERCE_STORES, STORE_CAPABILITIES } from "./stores";

/**
 * Insert missing store rows and backfill new flags on older documents.
 *
 * Existing admin toggles are left alone. New fields (free-offer ingest,
 * matching, price refresh) get the seed default so Steam/GOG/Epic keep
 * ingesting giveaways without a checkbox pass.
 */
export async function ensureCommerceStores() {
  await dbConnect();
  for (const seed of SEED_COMMERCE_STORES) {
    const existing = (await StoreProvider.findOne({ slug: seed.slug }).lean()) as {
      active?: boolean;
      matchingEnabled?: boolean;
      priceRefreshEnabled?: boolean;
      affiliateDefault?: boolean;
      freeOffersEnabled?: boolean;
      discovery?: string;
    } | null;
    if (!existing) {
      await StoreProvider.create(seed);
      continue;
    }
    const $set: Record<string, unknown> = {};
    if (typeof existing.matchingEnabled !== "boolean") $set.matchingEnabled = seed.matchingEnabled;
    if (typeof existing.priceRefreshEnabled !== "boolean") $set.priceRefreshEnabled = seed.priceRefreshEnabled;
    if (typeof existing.affiliateDefault !== "boolean") $set.affiliateDefault = seed.affiliateDefault;
    if (typeof existing.discovery !== "string") $set.discovery = seed.discovery;
    if (typeof existing.freeOffersEnabled !== "boolean") {
      const canIngest = STORE_CAPABILITIES[seed.slug].freeOfferIngest;
      $set.freeOffersEnabled = canIngest && existing.active !== false;
    }
    if (Object.keys($set).length > 0) {
      await StoreProvider.updateOne({ slug: seed.slug }, { $set });
    }
  }
}
