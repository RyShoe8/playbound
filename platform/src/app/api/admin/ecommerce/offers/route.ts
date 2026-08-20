import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { accessFromDoc } from "@/lib/access/docs";
import { offersFromUnknown, removeOffer, setOfferDisplayed } from "@/lib/access/offers";
import type { GameAccess } from "@/lib/access/types";

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(2000),
  isActive: z.boolean(),
});

const deleteSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(2000),
});

function accessForToggle(raw: unknown): GameAccess | null {
  const parsed = accessFromDoc(raw);
  if (parsed) return parsed;
  if (!raw || typeof raw !== "object") return null;
  const offers = offersFromUnknown((raw as { offers?: unknown }).offers);
  if (offers.length === 0) return null;
  return {
    priceType: "PAID",
    regularPriceCents: null,
    currentPriceCents: null,
    qualifyingPriceCents: null,
    currency: "USD",
    purchaseRequired: true,
    offers,
  };
}

/**
 * Flip Display on one named game's purchase source.
 *
 * Only `access.offers.$[url].isActive` and the derived current price are
 * written. Names, editorial, and the rest of access stay untouched.
 */
export async function PATCH(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Need slug, url, and isActive." }, { status: 400 });
  }
  const { slug, url, isActive } = parsed.data;

  await dbConnect();
  const game = await CatalogGame.findOne({ slug }).select("slug access").lean();
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const access = accessForToggle(game.access);
  if (!access) {
    return NextResponse.json({ error: "That game has no purchase sources." }, { status: 404 });
  }
  const next = setOfferDisplayed(access, url, isActive);
  if (!next) {
    return NextResponse.json({ error: "No source with that URL." }, { status: 404 });
  }

  await CatalogGame.updateOne(
    { slug },
    {
      $set: {
        "access.offers": next.offers,
        "access.currentPriceCents": next.currentPriceCents,
      },
    }
  );
  revalidateTag("catalog", { expire: 0 });
  return NextResponse.json({ ok: true, currentPriceCents: next.currentPriceCents });
}

/**
 * Delete one purchase source completely from a game.
 */
export async function DELETE(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Need slug and url." }, { status: 400 });
  }
  const { slug, url } = parsed.data;

  await dbConnect();
  const game = await CatalogGame.findOne({ slug }).select("slug access").lean();
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const access = accessForToggle(game.access);
  if (!access) {
    return NextResponse.json({ error: "That game has no purchase sources." }, { status: 404 });
  }
  const next = removeOffer(access, url);
  if (!next) {
    return NextResponse.json({ error: "No source with that URL." }, { status: 404 });
  }

  await CatalogGame.updateOne(
    { slug },
    {
      $set: {
        "access.offers": next.offers,
        "access.currentPriceCents": next.currentPriceCents,
      },
    }
  );
  revalidateTag("catalog", { expire: 0 });
  return NextResponse.json({ ok: true, currentPriceCents: next.currentPriceCents });
}
