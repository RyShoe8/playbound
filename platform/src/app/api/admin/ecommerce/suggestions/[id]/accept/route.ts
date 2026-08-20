import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import StoreMatchSuggestion from "@/lib/models/StoreMatchSuggestion";
import { applyStoreHit } from "@/lib/commerce/matchCatalog";
import type { CommerceStoreSlug } from "@/lib/commerce/stores";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await ctx.params;
  const body = z.object({ url: z.string().url() }).parse(await req.json());
  await dbConnect();
  const suggestion = await StoreMatchSuggestion.findById(id).lean();
  if (!suggestion || suggestion.status !== "pending") {
    return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  }
  const candidates = (suggestion.candidates ?? []) as Array<{
    title: string;
    url: string;
    externalId?: string;
    priceCents?: number | null;
    listPriceCents?: number | null;
  }>;
  const candidate = candidates.find((c) => c.url === body.url);
  if (!candidate) {
    return NextResponse.json({ error: "That listing is not in the suggestion." }, { status: 400 });
  }
  await applyStoreHit({
    slug: suggestion.gameSlug,
    hit: {
      store: suggestion.store as CommerceStoreSlug,
      retailer: suggestion.retailer,
      title: candidate.title,
      url: candidate.url,
      externalId: candidate.externalId || "",
      priceCents: candidate.priceCents ?? null,
      listPriceCents: candidate.listPriceCents ?? null,
    },
    matchSource: "manual",
    writeOffer: true,
  });
  const remaining = candidates.filter((c) => c.url !== body.url);
  if (remaining.length > 0) {
    await StoreMatchSuggestion.updateOne(
      { _id: id },
      { $set: { candidates: remaining, status: "pending" } }
    );
  } else {
    await StoreMatchSuggestion.updateOne(
      { _id: id },
      { $set: { status: "accepted", candidates: [] } }
    );
  }
  revalidateTag("catalog", { expire: 0 });
  return NextResponse.json({ ok: true });
}
