/**
 * Store-discount ingestion engine.
 *
 * Mirrors `src/lib/freeOffers/ingestion.ts` deliberately, minus the catalog
 * matching step — a discount here does not need a PlayBound catalog game to
 * exist. See `src/lib/models/StoreDiscount.ts`.
 *
 * Idempotent: running twice produces the same result, no duplicate rows.
 * Failure-tolerant: a provider failing does NOT affect other providers' data,
 * and never causes existing rows for that store to be expired.
 */

import { revalidateTag } from "next/cache";
import dbConnect from "@/lib/db";
import StoreDiscount from "@/lib/models/StoreDiscount";
import IngestionLog from "@/lib/models/IngestionLog";
import StoreProviderModel from "@/lib/models/StoreProvider";
import { ensureCommerceStores } from "@/lib/commerce/ensureStores";
import { getDiscountProvider } from "./providers";
import { DEEP_DISCOUNT_MIN_PERCENT } from "@/lib/dealsShared";
import {
  DISCOUNT_STORE_SLUGS,
  type DiscoveredDiscount,
  type DiscountIngestionResult,
  type DiscountStoreSlug,
} from "./types";

async function isProviderActive(store: DiscountStoreSlug): Promise<boolean> {
  const doc = await StoreProviderModel.findOne({ slug: store }).lean();
  if (!doc) return false; // Unlike free-offers, default OFF for an unrecognised store.
  const flagged = (doc as { discountScanEnabled?: boolean }).discountScanEnabled;
  return flagged === true;
}

async function ingestProvider(store: DiscountStoreSlug): Promise<DiscountIngestionResult> {
  const start = Date.now();
  const result: DiscountIngestionResult = {
    provider: store,
    status: "failed",
    discountsFound: 0,
    discountsCreated: 0,
    discountsUpdated: 0,
    discountsExpired: 0,
    durationMs: 0,
  };

  const log = await IngestionLog.create({
    provider: store,
    jobKind: "store_discounts",
    startedAt: new Date(),
    status: "failed",
  });

  const finishLog = (patch: Record<string, unknown>) =>
    IngestionLog.findByIdAndUpdate(log._id, { $set: { completedAt: new Date(), ...patch } }).catch(
      () => {}
    );

  try {
    if (!(await isProviderActive(store))) {
      result.status = "success";
      result.durationMs = Date.now() - start;
      await finishLog({ status: "success" });
      return result;
    }

    const adapter = getDiscountProvider(store);
    let discovered: DiscoveredDiscount[];
    try {
      discovered = await adapter.fetchDiscounts(DEEP_DISCOUNT_MIN_PERCENT);
    } catch (fetchErr) {
      // Adapter failure — existing rows for this store are left untouched.
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[store-discounts] ${store} adapter failed:`, errMsg);
      result.error = errMsg;
      result.durationMs = Date.now() - start;
      await finishLog({
        status: "failed",
        errorMessage: errMsg,
        errorStack: fetchErr instanceof Error ? fetchErr.stack?.slice(0, 2000) : undefined,
      });
      return result;
    }

    result.discountsFound = discovered.length;
    const seenExternalIds = new Set<string>();

    for (const d of discovered) {
      seenExternalIds.add(d.externalId);

      const existing = await StoreDiscount.findOne({ store: d.store, externalId: d.externalId })
        .select("_id")
        .lean();

      const percentOff = Math.floor(((d.regularPriceCents - d.currentPriceCents) / d.regularPriceCents) * 100);
      const rowData = {
        store: d.store,
        externalId: d.externalId,
        title: d.title,
        storeUrl: d.storeUrl,
        coverImage: d.coverImage,
        genres: d.genres,
        developers: d.developers,
        platforms: d.platforms,
        currency: d.currency,
        regularPriceCents: d.regularPriceCents,
        currentPriceCents: d.currentPriceCents,
        percentOff,
        isActive: true,
        lastVerified: new Date(),
        metadata: d.metadata,
        // matchedGameSlug deliberately untouched on update — see the model's
        // doc comment; no matching pass sets it in V1, and updateOne with
        // $set never clears a field it doesn't mention.
      };

      if (existing) {
        await StoreDiscount.updateOne({ store: d.store, externalId: d.externalId }, { $set: rowData });
        result.discountsUpdated++;
      } else {
        try {
          await StoreDiscount.create(rowData);
          result.discountsCreated++;
        } catch (dupeErr) {
          if ((dupeErr as { code?: number }).code === 11000) {
            await StoreDiscount.updateOne({ store: d.store, externalId: d.externalId }, { $set: rowData });
            result.discountsUpdated++;
          } else {
            throw dupeErr;
          }
        }
      }
    }

    // Soft-expire anything from this store not in a fresh, non-empty pull —
    // same rule as free-offers: only when we know the store actually
    // responded, never on a failed fetch (handled above, before this point).
    if (discovered.length > 0) {
      const expireResult = await StoreDiscount.updateMany(
        { store, isActive: true, externalId: { $nin: [...seenExternalIds] } },
        { $set: { isActive: false, lastVerified: new Date() } }
      );
      result.discountsExpired = expireResult.modifiedCount;
    }

    result.status = "success";
    result.durationMs = Date.now() - start;
    await finishLog({
      status: "success",
      offersFound: result.discountsFound,
      offersCreated: result.discountsCreated,
      offersUpdated: result.discountsUpdated,
      offersExpired: result.discountsExpired,
    });
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[store-discounts] ${store} ingestion failed:`, errMsg);
    result.error = errMsg;
    result.durationMs = Date.now() - start;
    await finishLog({
      status: "failed",
      errorMessage: errMsg,
      errorStack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined,
    });
    return result;
  }
}

/**
 * Run the full store-discount ingestion pipeline.
 *
 * Sequential per store, same reasoning as free-offers: avoid hammering
 * several external APIs at once from one cron invocation.
 */
export async function ingestStoreDiscounts(opts?: {
  stores?: DiscountStoreSlug[];
}): Promise<DiscountIngestionResult[]> {
  await dbConnect();
  await ensureCommerceStores();

  const stores = opts?.stores ?? [...DISCOUNT_STORE_SLUGS];
  const results: DiscountIngestionResult[] = [];
  for (const store of stores) {
    results.push(await ingestProvider(store));
  }

  try {
    revalidateTag("store-discounts", { expire: 0 });
  } catch {
    // revalidateTag can fail outside a request context (e.g. in tests).
  }

  return results;
}
