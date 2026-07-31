import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { checkRateLimit } from "@/lib/discussion/rateLimit";

/** Slug shape the catalog actually uses — rejects junk before it reaches Mongo. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const clean = slug?.trim().toLowerCase() ?? "";
  if (!SLUG_RE.test(clean)) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    await dbConnect();

    /**
     * This endpoint is unauthenticated by design — the launcher reports an
     * install before the user has necessarily signed in — so the counter is
     * rate limited per client/slug. Without this, a loop could inflate
     * installCount without bound and drive unbounded writes.
     */
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const limited = await checkRateLimit(`install:${ip}:${clean}`, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many reports" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
      );
    }
    const updated = await CatalogGame.findOneAndUpdate(
      { slug: clean },
      { $inc: { installCount: 1 } },
      { new: true, projection: { installCount: 1 } }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      installCount: Number((updated as { installCount?: number }).installCount) || 0,
    });
  } catch (err) {
    console.error("[install/report]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
