import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import dbConnect from "@/lib/db";
import StoreProvider from "@/lib/models/StoreProvider";
import IngestionLog from "@/lib/models/IngestionLog";
import { cronAuthorized } from "@/lib/cronAuth";
import { matchCatalogBatch } from "@/lib/commerce/matchCatalog";
import { ingestStoreFeed } from "@/lib/commerce/feedIngest";
import { ensureCommerceStores } from "@/lib/commerce/ensureStores";
import { isCommerceStoreSlug, STORE_CAPABILITIES } from "@/lib/commerce/stores";

export const maxDuration = 60;

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await dbConnect();
  await ensureCommerceStores();
  const started = new Date();
  const log = await IngestionLog.create({
    provider: "catalog",
    jobKind: "catalog_match",
    startedAt: started,
    status: "failed",
  });

  const feeds: Array<{ store: string; found: number; error?: string }> = [];
  const feedStores = await StoreProvider.find({
    active: true,
    feedUrl: { $type: "string", $ne: "" },
  })
    .select("slug")
    .lean();
  for (const row of feedStores) {
    const store = String(row.slug);
    if (!isCommerceStoreSlug(store) || !STORE_CAPABILITIES[store].feedIngest) continue;
    feeds.push(await ingestStoreFeed(store));
  }

  try {
    const summary = await matchCatalogBatch({ limit: 15 });
    await IngestionLog.findByIdAndUpdate(log._id, {
      $set: {
        completedAt: new Date(),
        status: "success",
        gamesMatched: summary.applied,
        gamesUnmatched: summary.suggested,
      },
    });
    if (summary.applied > 0) revalidateTag("catalog", { expire: 0 });
    return NextResponse.json({ ok: true, summary, feeds });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Match failed.";
    await IngestionLog.findByIdAndUpdate(log._id, {
      $set: { completedAt: new Date(), status: "failed", errorMessage: message },
    });
    return NextResponse.json({ error: message, feeds }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
