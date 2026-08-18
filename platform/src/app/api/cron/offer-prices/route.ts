import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { cronAuthorized } from "@/lib/cronAuth";
import { lookupStorePrice, StorePriceError } from "@/lib/access/storePrices";
import { bestPurchase, offersFromUnknown } from "@/lib/access/offers";
import { retailerHasLivePrice } from "@/lib/access/storeUrls";
import StoreProvider from "@/lib/models/StoreProvider";
import { retailerToStoreSlug } from "@/lib/commerce/stores";
import { ensureCommerceStores } from "@/lib/commerce/ensureStores";

export const maxDuration = 60;

const STALE_MS = 12 * 60 * 60 * 1000;
const MAX_LOOKUPS = 25;

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  await ensureCommerceStores();
  const now = Date.now();
  const refreshOff = new Set(
    (
      await StoreProvider.find({ priceRefreshEnabled: false })
        .select("slug")
        .lean()
    ).map((s) => String(s.slug))
  );
  const games = await CatalogGame.find({ "access.priceType": "PAID", "access.offers.0": { $exists: true } })
    .select("slug access")
    .lean();

  const summary = { checked: 0, updated: 0, skipped: 0, failed: 0 };

  for (const game of games) {
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
      if (summary.checked >= MAX_LOOKUPS) {
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
      priceType: "PAID",
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
