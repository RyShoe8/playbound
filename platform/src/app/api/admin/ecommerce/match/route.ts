import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { requireAdminSession } from "@/lib/requireAdmin";
import { matchCatalogBatch, matchGameToStores } from "@/lib/commerce/matchCatalog";
import IngestionLog from "@/lib/models/IngestionLog";
import CatalogGame from "@/lib/models/CatalogGame";
import dbConnect from "@/lib/db";
import { accessFromDoc } from "@/lib/access/docs";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  await dbConnect();
  const body = z.object({ slug: z.string().trim().min(1).max(80).optional() }).parse(await req.json().catch(() => ({})));
  const started = new Date();
  const log = await IngestionLog.create({
    provider: body.slug || "catalog",
    jobKind: "catalog_match",
    startedAt: started,
    status: "failed",
  });
  try {
    const summary = body.slug
      ? await matchGameToStores(body.slug)
      : await matchCatalogBatch({ limit: 15 });
    const applied = "applied" in summary ? summary.applied : 0;
    await IngestionLog.findByIdAndUpdate(log._id, {
      $set: {
        completedAt: new Date(),
        status: "success",
        gamesMatched: applied,
        gamesUnmatched: "suggested" in summary ? summary.suggested : 0,
      },
    });
    if (applied > 0) revalidateTag("catalog", { expire: 0 });
    let access = null;
    if (body.slug) {
      const game = await CatalogGame.findOne({ slug: body.slug }).select("access").lean();
      access = accessFromDoc(game?.access) ?? null;
    }
    return NextResponse.json({ ok: true, summary, access });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Match failed.";
    await IngestionLog.findByIdAndUpdate(log._id, {
      $set: { completedAt: new Date(), status: "failed", errorMessage: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
