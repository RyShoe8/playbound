import dbConnect from "@/lib/db";
import StoreFeedProduct from "@/lib/models/StoreFeedProduct";
import StoreProvider from "@/lib/models/StoreProvider";
import IngestionLog from "@/lib/models/IngestionLog";
import { parseProductFeed } from "./feedParse";
import { isCommerceStoreSlug, STORE_CAPABILITIES, type CommerceStoreSlug } from "./stores";

const UA = "PlayBoundAdmin/1.0";

export type FeedIngestResult = {
  store: CommerceStoreSlug;
  found: number;
  upserted: number;
  error?: string;
};

export async function ingestStoreFeed(
  store: CommerceStoreSlug,
  uploaded?: { body: string; contentType?: string }
): Promise<FeedIngestResult> {
  await dbConnect();
  if (!STORE_CAPABILITIES[store].feedIngest) {
    return { store, found: 0, upserted: 0, error: "This store has no feed ingest path." };
  }

  const started = new Date();
  const log = await IngestionLog.create({
    provider: store,
    jobKind: "feed_ingest",
    startedAt: started,
    status: "failed",
  });

  try {
    let body = uploaded?.body ?? "";
    let contentType = uploaded?.contentType ?? "";
    if (!body) {
      const provider = await StoreProvider.findOne({ slug: store }).lean();
      const feedUrl = typeof provider?.feedUrl === "string" ? provider.feedUrl.trim() : "";
      if (!feedUrl) {
        throw new Error("Set a product feed URL or upload a feed file.");
      }
      const res = await fetch(feedUrl, {
        headers: { "user-agent": UA, accept: "*/*" },
        next: { revalidate: 0 },
      });
      if (!res.ok) throw new Error(`Feed request failed (${res.status}).`);
      body = await res.text();
      contentType = res.headers.get("content-type") || "";
    }

    const products = parseProductFeed(body, contentType);
    const now = new Date();
    let upserted = 0;
    for (const product of products) {
      await StoreFeedProduct.updateOne(
        { store, externalId: product.externalId },
        {
          $set: {
            title: product.title,
            url: product.url,
            priceCents: product.priceCents,
            listPriceCents: product.listPriceCents,
            ingestedAt: now,
          },
        },
        { upsert: true }
      );
      upserted += 1;
    }
    await IngestionLog.findByIdAndUpdate(log._id, {
      $set: {
        completedAt: new Date(),
        status: "success",
        offersFound: products.length,
        offersUpdated: upserted,
      },
    });
    return { store, found: products.length, upserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Feed ingest failed.";
    await IngestionLog.findByIdAndUpdate(log._id, {
      $set: { completedAt: new Date(), status: "failed", errorMessage: message },
    });
    return { store, found: 0, upserted: 0, error: message };
  }
}

export function parseStoreSlug(raw: unknown): CommerceStoreSlug | null {
  return isCommerceStoreSlug(raw) ? raw : null;
}
