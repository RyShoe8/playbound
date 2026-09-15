import { cache } from "react";
import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import StoreProvider from "@/lib/models/StoreProvider";
import {
  AFFILIATE_PARAM_DEFAULTS,
  isCommerceStoreSlug,
  storeSlugToRetailer,
} from "./stores";

import type { StoreAffiliateStamp } from "@/lib/access/storeUrls";

export type { StoreAffiliateStamp };

async function readAffiliateMap(): Promise<Record<string, StoreAffiliateStamp>> {
  await dbConnect();
  const docs = await StoreProvider.find()
    .select("slug affiliateId affiliateParam affiliateUrlTemplate")
    .lean();
  const out: Record<string, StoreAffiliateStamp> = {};
  for (const doc of docs) {
    const slug = String(doc.slug);
    if (!isCommerceStoreSlug(slug)) continue;
    const retailer = storeSlugToRetailer(slug);
    if (!retailer) continue;
    const template = typeof doc.affiliateUrlTemplate === "string" ? doc.affiliateUrlTemplate.trim() : "";
    const id = typeof doc.affiliateId === "string" ? doc.affiliateId.trim() : "";
    const stored = typeof doc.affiliateParam === "string" ? doc.affiliateParam.trim() : "";
    const param = stored || AFFILIATE_PARAM_DEFAULTS[slug] || "";
    if (template) {
      out[retailer] = { id: id || undefined, param: param || undefined, template };
    } else if (id && param) {
      out[retailer] = { id, param };
    }
  }
  return out;
}

export const getStoreAffiliateMap = cache(async (): Promise<Record<string, StoreAffiliateStamp>> =>
  unstable_cache(readAffiliateMap, ["store-affiliates"], {
    revalidate: 300,
    tags: ["store-affiliates"],
  })()
);
