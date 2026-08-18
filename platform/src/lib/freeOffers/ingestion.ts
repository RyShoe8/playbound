/**
 * Free-offer ingestion engine.
 *
 * Orchestrates the full ingestion pipeline:
 *   1. Fetch current offers from store adapters
 *   2. For each offer: deduplicate, match against catalog, persist
 *   3. Mark expired offers inactive (only when fresh data confirms it)
 *   4. Log the run
 *   5. Bust caches
 *
 * Idempotent: running twice produces the same result, no duplicate offers/games.
 * Failure-tolerant: a provider failing does NOT affect other providers' data.
 */

import { revalidateTag } from "next/cache";
import dbConnect from "@/lib/db";
import FreeOffer from "@/lib/models/FreeOffer";
import CatalogGame from "@/lib/models/CatalogGame";
import IngestionLog from "@/lib/models/IngestionLog";
import StoreProviderModel from "@/lib/models/StoreProvider";
import { getProvider } from "./providers";
import { matchGame } from "./matching";
import type { DiscoveredOffer } from "./providers/types";
import type { IngestionResult, StoreSlug } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function isProviderActive(store: StoreSlug): Promise<boolean> {
  const doc = await StoreProviderModel.findOne({ slug: store }).lean();
  return doc ? (doc as { active?: boolean }).active !== false : true;
}

// ── Per-provider ingestion ───────────────────────────────────────────────

async function ingestProvider(store: StoreSlug): Promise<IngestionResult> {
  const start = Date.now();
  const result: IngestionResult = {
    provider: store,
    status: "failed",
    offersFound: 0,
    offersCreated: 0,
    offersUpdated: 0,
    offersExpired: 0,
    gamesMatched: 0,
    gamesCreated: 0,
    gamesUnmatched: 0,
    durationMs: 0,
  };

  const log = await IngestionLog.create({
    provider: store,
    jobKind: "free_offers",
    startedAt: new Date(),
    status: "failed",
  });

  try {
    // Check if provider is active.
    const active = await isProviderActive(store);
    if (!active) {
      result.status = "success";
      result.durationMs = Date.now() - start;
      await IngestionLog.findByIdAndUpdate(log._id, {
        $set: {
          completedAt: new Date(),
          ...result,
          status: "success",
        },
      });
      return result;
    }

    // Fetch offers from the adapter.
    const adapter = getProvider(store);
    let discovered: DiscoveredOffer[];
    try {
      discovered = await adapter.fetchCurrentOffers();
    } catch (fetchErr) {
      // Adapter failure — do NOT touch existing offers.
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const errStack = fetchErr instanceof Error ? fetchErr.stack : undefined;
      console.error(`[ingestion] ${store} adapter failed:`, errMsg);
      result.error = errMsg;
      await IngestionLog.findByIdAndUpdate(log._id, {
        $set: {
          completedAt: new Date(),
          status: "failed",
          errorMessage: errMsg,
          errorStack: errStack?.slice(0, 2000),
        },
      });
      result.durationMs = Date.now() - start;
      return result;
    }

    result.offersFound = discovered.length;

    // Process each discovered offer.
    const seenExternalIds = new Set<string>();

    for (const offer of discovered) {
      seenExternalIds.add(offer.externalId);

      // Check for existing offer (idempotent upsert).
      const existing = await FreeOffer.findOne({
        store: offer.store,
        externalId: offer.externalId,
      }).lean();

      // Match against catalog.
      const matchResult = await matchGame(offer);

      let gameSlug: string | null = null;
      let gameId: string | null = null;

      if (matchResult.game) {
        gameSlug = matchResult.game.slug;
        gameId = matchResult.game.slug; // We'll resolve the actual ObjectId below.
        result.gamesMatched++;

        // Resolve actual Mongo ObjectId.
        const gameDoc = await CatalogGame.findOne({ slug: gameSlug })
          .select("_id")
          .lean();
        if (gameDoc) {
          gameId = String((gameDoc as { _id: unknown })._id);
        }
      } else {
        // Unmatched store giveaway: keep offer standalone without creating stub catalog game records.
        result.gamesUnmatched++;
      }

      // Upsert the free offer.
      const offerData = {
        gameId: gameId || null,
        gameSlug: gameSlug || null,
        unmatchedTitle: offer.title || (matchResult.game ? matchResult.game.title : null),
        store: offer.store,
        offerType: offer.offerType,
        startDate: offer.startDate,
        endDate: offer.endDate,
        claimUrl: offer.claimUrl,
        storeUrl: offer.storeUrl,
        isActive: true,
        lastVerified: new Date(),
        source: `${offer.store}-api`,
        externalId: offer.externalId,
        retailPrice: offer.retailPrice,
        retailPriceValue: offer.retailPriceValue,
        currency: offer.currency,
        coverImage: offer.coverImage,
        description: offer.description,
        developer: offer.developer,
        publisher: offer.publisher,
        platforms: offer.platforms,
        isBaseGame: offer.isBaseGame,
        videos: offer.videos,
        redemptionPlatform: offer.redemptionPlatform,
        matchConfidence: matchResult.confidence,
        metadata: {
          ...(offer.metadata || {}),
          title: offer.title,
        },
      };

      if (existing) {
        await FreeOffer.updateOne(
          { store: offer.store, externalId: offer.externalId },
          { $set: offerData }
        );
        result.offersUpdated++;
      } else {
        try {
          await FreeOffer.create(offerData);
          result.offersCreated++;
        } catch (dupeErr) {
          // E11000 duplicate key — race condition, safe to ignore.
          if ((dupeErr as { code?: number }).code === 11000) {
            await FreeOffer.updateOne(
              { store: offer.store, externalId: offer.externalId },
              { $set: offerData }
            );
            result.offersUpdated++;
          } else {
            throw dupeErr;
          }
        }
      }
    }

    // Mark offers as expired ONLY for offers from this provider that
    // were NOT in the current batch AND whose endDate has passed.
    // CRITICAL: We only do this when we successfully fetched data.
    if (discovered.length > 0) {
      const now = new Date();
      const expireResult = await FreeOffer.updateMany(
        {
          store,
          isActive: true,
          externalId: { $nin: [...seenExternalIds] },
          $or: [
            { endDate: { $lte: now } },
            // If the offer wasn't in the latest batch and has no end date,
            // only expire it if we got a non-empty batch (meaning the store
            // is responding and this offer is genuinely gone).
            { endDate: null },
          ],
        },
        { $set: { isActive: false, lastVerified: now } }
      );
      result.offersExpired = expireResult.modifiedCount;
    }

    // Also expire any offers (any provider) whose endDate has passed.
    const now = new Date();
    await FreeOffer.updateMany(
      { isActive: true, endDate: { $lte: now, $ne: null } },
      { $set: { isActive: false, lastVerified: now } }
    );

    result.status = "success";
    result.durationMs = Date.now() - start;

    // Update log.
    await IngestionLog.findByIdAndUpdate(log._id, {
      $set: {
        completedAt: new Date(),
        ...result,
        status: "success",
      },
    });

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error(`[ingestion] ${store} ingestion failed:`, errMsg);
    result.error = errMsg;
    result.durationMs = Date.now() - start;

    await IngestionLog.findByIdAndUpdate(log._id, {
      $set: {
        completedAt: new Date(),
        status: "failed",
        errorMessage: errMsg,
        errorStack: errStack?.slice(0, 2000),
      },
    }).catch(() => {});

    return result;
  }
}

// ── Main entry point ─────────────────────────────────────────────────────

/**
 * Run the full ingestion pipeline.
 *
 * Processes each provider independently — a failure in one does not
 * affect others. Returns results per provider.
 */
export async function ingestFreeOffers(opts?: {
  stores?: StoreSlug[];
}): Promise<IngestionResult[]> {
  await dbConnect();

  const stores = opts?.stores ?? (["epic", "steam", "gog", "prime_gaming"] as StoreSlug[]);
  const results: IngestionResult[] = [];

  // Process providers sequentially to avoid overwhelming store APIs.
  for (const store of stores) {
    const result = await ingestProvider(store);
    results.push(result);
  }

  // Bust caches so the frontend picks up new data.
  try {
    revalidateTag("free-offers", { expire: 0 });
    revalidateTag("catalog", { expire: 0 });
  } catch {
    // revalidateTag can fail outside of a request context (e.g., in tests).
  }

  return results;
}
