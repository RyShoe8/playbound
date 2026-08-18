import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import StoreProvider from "@/lib/models/StoreProvider";
import IngestionLog from "@/lib/models/IngestionLog";
import {
  AFFILIATE_PARAM_DEFAULTS,
  COMMERCE_STORE_SLUGS,
  SEED_COMMERCE_STORES,
  STORE_CAPABILITIES,
  isCommerceStoreSlug,
} from "@/lib/commerce/stores";
import { ensureCommerceStores } from "@/lib/commerce/ensureStores";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  await ensureCommerceStores();
  const [stores, logs] = await Promise.all([
    StoreProvider.find({ slug: { $in: [...COMMERCE_STORE_SLUGS] } })
      .sort({ name: 1 })
      .lean(),
    IngestionLog.find().sort({ startedAt: -1 }).limit(40).lean(),
  ]);
  const latestByProvider = new Map<string, { jobKind?: string; startedAt: Date; status: string }>();
  for (const log of logs) {
    const key = `${log.provider}:${log.jobKind || "free_offers"}`;
    if (!latestByProvider.has(key)) {
      latestByProvider.set(key, {
        jobKind: log.jobKind,
        startedAt: log.startedAt,
        status: log.status,
      });
    }
  }
  return NextResponse.json({
    stores: stores.map((s) => {
      const rawSlug = String(s.slug);
      const slug = isCommerceStoreSlug(rawSlug) ? rawSlug : null;
      const caps = slug ? STORE_CAPABILITIES[slug] : null;
      return {
        slug: s.slug,
        name: s.name,
        baseUrl: s.baseUrl,
        color: s.color,
        matchingEnabled: Boolean(s.matchingEnabled),
        priceRefreshEnabled: Boolean(s.priceRefreshEnabled),
        freeOffersEnabled: Boolean(s.freeOffersEnabled),
        affiliateDefault: s.affiliateDefault !== false,
        affiliateId: typeof s.affiliateId === "string" ? s.affiliateId : "",
        affiliateParam: typeof s.affiliateParam === "string" ? s.affiliateParam : "",
        defaultAffiliateParam: slug ? AFFILIATE_PARAM_DEFAULTS[slug] || "" : "",
        discovery: s.discovery || caps?.discovery || "manual",
        feedUrl: s.feedUrl || "",
        capabilities: caps,
        lastMatch: latestByProvider.get(`${s.slug}:catalog_match`) || null,
        lastFeed: latestByProvider.get(`${s.slug}:feed_ingest`) || null,
        lastFreeOffers: latestByProvider.get(`${s.slug}:free_offers`) || null,
      };
    }),
  });
}

const patchSchema = z.object({
  slug: z.string(),
  matchingEnabled: z.boolean().optional(),
  priceRefreshEnabled: z.boolean().optional(),
  freeOffersEnabled: z.boolean().optional(),
  affiliateDefault: z.boolean().optional(),
  affiliateId: z.string().trim().max(120).nullable().optional(),
  affiliateParam: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9_-]*$/, "Query param must be letters, numbers, _ or -.")
    .nullable()
    .optional(),
  feedUrl: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const body = patchSchema.parse(await req.json());
  if (!isCommerceStoreSlug(body.slug)) {
    return NextResponse.json({ error: "Unknown store." }, { status: 400 });
  }
  await dbConnect();
  const $set: Record<string, unknown> = {};
  if (body.matchingEnabled != null) $set.matchingEnabled = body.matchingEnabled;
  if (body.priceRefreshEnabled != null) $set.priceRefreshEnabled = body.priceRefreshEnabled;
  if (body.freeOffersEnabled != null) $set.freeOffersEnabled = body.freeOffersEnabled;
  if (body.affiliateDefault != null) $set.affiliateDefault = body.affiliateDefault;
  if (body.affiliateId !== undefined) $set.affiliateId = body.affiliateId || null;
  if (body.affiliateParam !== undefined) $set.affiliateParam = body.affiliateParam || null;
  if (body.feedUrl !== undefined) $set.feedUrl = body.feedUrl || null;
  await StoreProvider.updateOne({ slug: body.slug }, { $set }, { upsert: false });
  if (body.affiliateId !== undefined || body.affiliateParam !== undefined) {
    revalidateTag("store-affiliates", { expire: 0 });
  }
  return NextResponse.json({ ok: true });
}

const addSchema = z.object({ slug: z.string() });

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { slug } = addSchema.parse(await req.json());
  const seed = SEED_COMMERCE_STORES.find((s) => s.slug === slug);
  if (!seed) return NextResponse.json({ error: "No adapter for that store." }, { status: 400 });
  await dbConnect();
  await StoreProvider.updateOne({ slug: seed.slug }, { $setOnInsert: seed }, { upsert: true });
  return NextResponse.json({ ok: true });
}
