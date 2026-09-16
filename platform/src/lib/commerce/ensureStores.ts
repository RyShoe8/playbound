import dbConnect from "@/lib/db";
import StoreProvider from "@/lib/models/StoreProvider";
import { SEED_COMMERCE_STORES, STORE_CAPABILITIES } from "./stores";

let lastEnsured = 0;
const ONE_HOUR = 60 * 60 * 1000;

/**
 * Insert missing store rows and backfill new flags on older documents.
 *
 * Existing admin toggles are left alone. New fields (free-offer ingest,
 * matching, price refresh) get the seed default so Steam/GOG/Epic keep
 * ingesting giveaways without a checkbox pass.
 */
export async function ensureCommerceStores(force = false) {
  const now = Date.now();
  if (!force && now - lastEnsured < ONE_HOUR) return;
  lastEnsured = now;
  await dbConnect();
  for (const seed of SEED_COMMERCE_STORES) {
    const existing = (await StoreProvider.findOne({ slug: seed.slug }).lean()) as {
      active?: boolean;
      matchingEnabled?: boolean;
      priceRefreshEnabled?: boolean;
      affiliateDefault?: boolean;
      freeOffersEnabled?: boolean;
      discovery?: string;
      affiliateId?: string | null;
      affiliateParam?: string | null;
      affiliateUrlTemplate?: string | null;
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
    if (seed.affiliateUrlTemplate && !existing.affiliateUrlTemplate) {
      $set.affiliateUrlTemplate = seed.affiliateUrlTemplate;
    }
    if (seed.affiliateId && !existing.affiliateId) {
      $set.affiliateId = seed.affiliateId;
    }
    if (seed.affiliateParam && !existing.affiliateParam) {
      $set.affiliateParam = seed.affiliateParam;
    }
    if (Object.keys($set).length > 0) {
      await StoreProvider.updateOne({ slug: seed.slug }, { $set });
    }
  }
}
