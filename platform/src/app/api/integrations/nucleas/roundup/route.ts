import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import BlogPost from "@/lib/models/BlogPost";
import CatalogGame from "@/lib/models/CatalogGame";
import { mongoVisibleFilter } from "@/lib/catalogStatus";
import { SITE_URL } from "@/lib/site";
import { publicationIdentity, roundupInput, verifyRoundupRequest } from "@/lib/nucleasRoundup";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const iso = (value: unknown) => value ? new Date(String(value)).toISOString() : null;
// PlayBound's editorial cover for this series; callers remain brand agnostic.
const ROUNDUP_COVER = `${SITE_URL}/blog/new-games-platform-updates-blue.png`;
type Doc = Record<string, unknown>;
function postRecord(post: Doc) {
  return { id: String(post._id), slug: String(post.slug), url: `${SITE_URL}/blog/${post.slug}`, title: post.title, summary: post.summary, bodyMarkdown: post.bodyMarkdown, publishedAt: iso(post.publishedAt), sourceKey: post.sourceKey ?? null, coverageStart: iso(post.coverageStart), coverageEnd: iso(post.coverageEnd), coveredIds: post.coveredIds ?? [] };
}
function baselineRecord(post: Doc) {
  return { slug: String(post.slug), url: `${SITE_URL}/blog/${post.slug}`, publishedAt: iso(post.coverageEnd ?? post.publishedAt), coverageEnd: iso(post.coverageEnd), coveredIds: post.coveredIds ?? [] };
}

async function handle(req: Request) {
  const secret = process.env.NUCLEAS_ROUNDUP_SECRET;
  if (!secret) return json({ error: "Integration is not configured" }, 503);
  const rawBody = await req.text();
  if (!verifyRoundupRequest(req, rawBody, secret)) return json({ error: "Unauthorized" }, 401);
  try {
    if (req.method === "GET") {
      const params = new URL(req.url).searchParams;
      const explicitRange = params.has("since") || params.has("until")
        ? z.object({ since: z.iso.datetime({ offset: true }), until: z.iso.datetime({ offset: true }) }).parse({ since: params.get("since"), until: params.get("until") })
        : null;
      if (explicitRange && Date.parse(explicitRange.since) >= Date.parse(explicitRange.until)) return json({ error: "since must precede until" }, 400);
      await dbConnect();
      const now = new Date();
      const previous = await BlogPost.findOne({ published: true, publishedAt: { $lte: now }, $or: [{ sourceKey: /^nucleas:roundup:/ }, { slug: "new-games-platform-updates" }] }).sort({ publishedAt: -1, _id: -1 }).lean();
      const boundary = previous ? iso(previous.coverageEnd ?? previous.publishedAt) : null;
      const range = explicitRange ?? { since: boundary, until: now.toISOString() };
      // Read raw catalog rows: never seeds, repair helpers, or write-capable catalog paths.
      const games = range.since && Date.parse(range.since) < Date.parse(range.until) ? await CatalogGame.find({ $and: [mongoVisibleFilter(), { publishedAt: { $gte: new Date(range.since), $lt: new Date(range.until) } }] })
        .select("slug title tagline description longDescription genres features platforms maxPlayers browserPlayable access publishedAt")
        .sort({ publishedAt: 1, _id: 1 }).limit(2001).lean() : [];
      if (games.length > 2000) return json({ error: "Range contains more than 2000 games; request a narrower date range" }, 422);
      return json({ ...range, games: games.map((g: Doc) => ({ id: String(g._id), slug: g.slug, url: `${SITE_URL}/games/${g.slug}`, title: g.title, tagline: g.tagline, description: g.description, longDescription: g.longDescription ?? null, genres: g.genres ?? [], features: g.features ?? [], platforms: g.platforms ?? [], maxPlayers: g.maxPlayers ?? null, browserPlayable: g.browserPlayable === true, access: g.access ?? null, priceType: (g.access as { priceType?: string } | undefined)?.priceType ?? "FREE", publishedAt: iso(g.publishedAt), publicationDateBasis: "publishedAt" })), previousRoundup: previous ? postRecord(previous as Doc) : null, baseline: previous ? baselineRecord(previous as Doc) : null, lastRoundup: previous ? baselineRecord(previous as Doc) : null, limitations: ["Catalog publishedAt is the latest publication transition, not guaranteed first publication; firstPublishedAt is not recorded. Undated legacy games are excluded. createdAt is never used.", "access contains stored acquisition facts, not resolved dependency pricing; absent access is the legacy free catalog convention."] });
    }
    const input = roundupInput.parse(JSON.parse(rawBody));
    const identity = publicationIdentity(input);
    await dbConnect();
    // Fail closed if the uniqueness constraint cannot be established. No GET index writes.
    await BlogPost.collection.createIndex({ sourceKey: 1 }, { unique: true, partialFilterExpression: { sourceKey: { $type: "string" } } });
    let existing = await BlogPost.findOne({ sourceKey: identity.sourceKey }).lean();
    let created = false;
    if (!existing) {
      try {
        existing = await BlogPost.create({ ...identity.normalized, coverImageUrl: ROUNDUP_COVER, idempotencyKey: undefined, slug: identity.slug, sourceKey: identity.sourceKey, sourcePayloadHash: identity.hash, published: true, publishedAt: new Date(), authorName: "PlayBound Team" });
        created = true;
      } catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
        existing = await BlogPost.findOne({ sourceKey: identity.sourceKey }).lean();
        if (!existing) throw error;
      }
    }
    if (existing.sourcePayloadHash !== identity.hash) return json({ error: "Idempotency key already used with different content" }, 409);
    if (existing.published !== true) return json({ error: "Existing roundup is no longer published" }, 409);
    // Also invalidate on retry, recovering a failure after insertion but before invalidation.
    revalidateTag("blog", { expire: 0 });
    revalidatePath("/blog");
    revalidatePath("/sitemap.xml");
    revalidatePath(`/blog/${existing.slug}`);
    return json({ published: true, idempotencyKey: input.idempotencyKey, url: `${SITE_URL}/blog/${existing.slug}`, created, post: postRecord(existing as Doc) }, created ? 201 : 200);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "Invalid request" }, 400);
    console.error("[nucleas-roundup] request failed", error);
    return json({ error: "Roundup request failed" }, 500);
  }
}
export const GET = handle;
export const POST = handle;

