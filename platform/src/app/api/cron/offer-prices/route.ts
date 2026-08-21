import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { cronAuthorized } from "@/lib/cronAuth";
import { lookupStorePrice, StorePriceError } from "@/lib/access/storePrices";
import { bestPurchase, offersFromUnknown } from "@/lib/access/offers";
import { orderByStalest } from "@/lib/access/priceRefreshQueue";
import { retailerHasLivePrice } from "@/lib/access/storeUrls";
import StoreProvider from "@/lib/models/StoreProvider";
import { retailerToStoreSlug } from "@/lib/commerce/stores";
import { ensureCommerceStores } from "@/lib/commerce/ensureStores";

export const maxDuration = 60;

const STALE_MS = 12 * 60 * 60 * 1000;

/**
 * Ceiling on store lookups per run, and the wall clock that really governs it.
 *
 * The count used to be 25 with no ordering, which starved most of the catalog.
 * Games were read in natural order and the stale window (12h) is shorter than
 * the interval between runs (24h), so the same first 25 offers were eligible
 * every night, spent the whole budget every night, and everything behind them
 * was never priced at all.
 *
 * The ordering fix below is what actually solves that. The count is raised
 * because it no longer has to double as a fairness mechanism, and the deadline
 * takes over as the real guard — it is the one tied to the thing we can
 * actually run out of, since `maxDuration` is 60s and each lookup is a network
 * round trip to a storefront.
 */
const MAX_LOOKUPS = 120;
const DEADLINE_MS = 45_000;

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  await ensureCommerceStores();
  const now = Date.now();
  const startedAt = now;
  const refreshOff = new Set(
    (
      await StoreProvider.find({ priceRefreshEnabled: false })
        .select("slug")
        .lean()
    ).map((s) => String(s.slug))
  );
  /*
   * PAID_BASE_GAME_REQUIRED is included deliberately. Those games are bought
   * from a storefront like any other — the flag describes what the purchase
   * gets you, not whether it has a price — and excluding them meant their
   * offers were never repriced.
   */
  const games = await CatalogGame.find({
    "access.priceType": { $in: ["PAID", "PAID_BASE_GAME_REQUIRED"] },
    "access.offers.0": { $exists: true },
  })
    .select("slug access")
    .lean();

  /*
   * Least-recently-priced first, so a capped run rotates through the catalog
   * instead of re-pricing the same head of the list every night.
   */
  const queue = orderByStalest(games, (game) =>
    offersFromUnknown((game.access as Record<string, unknown> | undefined)?.offers)
  );

  const summary = { checked: 0, updated: 0, skipped: 0, failed: 0, exhausted: false };

  for (const game of queue) {
    const access = game.access as Record<string, unknown> | undefined;
    const offers = offersFromUnknown(access?.offers);
    if (offers.length === 0) {
      summary.skipped += 1;
      continue;
    }

    let changed = false;
    const nextOffers: typeof offers = [];
    for (const offer of offers) {
      const checked = offer.lastCheckedAt ? new Date(offer.lastCheckedAt).getTime() : 0;
      if (Number.isFinite(checked) && now - checked < STALE_MS) {
        nextOffers.push(offer);
        summary.skipped += 1;
        continue;
      }
      const storeSlug = retailerToStoreSlug(offer.retailer);
      if (!retailerHasLivePrice(offer.retailer) || (storeSlug && refreshOff.has(storeSlug))) {
        nextOffers.push(offer);
        summary.skipped += 1;
        continue;
      }
      /*
       * Out of budget. The offer is kept as-is and stays stale, so the sort
       * above puts it near the front of the next run — which is what makes a
       * capped run rotate rather than starve.
       */
      if (summary.checked >= MAX_LOOKUPS || Date.now() - startedAt > DEADLINE_MS) {
        summary.exhausted = true;
        nextOffers.push(offer);
        summary.skipped += 1;
        continue;
      }
      summary.checked += 1;
      try {
        const live = await lookupStorePrice(offer.url);
        nextOffers.push({
          ...offer,
          retailer: live.retailer || offer.retailer,
          url: live.url || offer.url,
          priceCents: live.priceCents,
          lastCheckedAt: new Date(now).toISOString(),
        });
        if (live.priceCents !== offer.priceCents) changed = true;
      } catch (err) {
        summary.failed += 1;
        nextOffers.push(offer);
        if (!(err instanceof StorePriceError)) {
          console.warn(`[offer-prices] ${game.slug} ${offer.retailer}:`, err);
        }
      }
    }

    const derived = bestPurchase({
      // The document's own classification, not a hardcoded "PAID". bestPurchase
      // reads only the offers today, so this changes nothing now — but stating
      // a value that contradicts the record is how it breaks the day it does.
      priceType: (access?.priceType as "PAID" | "PAID_BASE_GAME_REQUIRED") ?? "PAID",
      regularPriceCents: (access?.regularPriceCents as number) ?? null,
      currentPriceCents: (access?.currentPriceCents as number) ?? null,
      qualifyingPriceCents: (access?.qualifyingPriceCents as number) ?? null,
      currency: "USD",
      purchaseRequired: true,
      offers: nextOffers,
    });
    const current = derived?.priceCents ?? (access?.currentPriceCents as number) ?? null;
    if (current !== (access?.currentPriceCents as number | null)) changed = true;

    if (!changed && nextOffers.every((o, i) => o.lastCheckedAt === offers[i]?.lastCheckedAt)) {
      continue;
    }

    await CatalogGame.updateOne(
      { _id: game._id },
      {
        $set: {
          "access.offers": nextOffers,
          "access.currentPriceCents": current,
        },
      }
    );
    summary.updated += 1;
  }

  if (summary.updated > 0) revalidateTag("catalog", { expire: 0 });
  return NextResponse.json({ ok: true, summary });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
