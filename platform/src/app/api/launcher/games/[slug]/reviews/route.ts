import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getGame } from "@/lib/catalog";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import { gameScopedUgcFilter } from "@/lib/ugcTarget";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

/**
 * GET /api/launcher/games/[slug]/reviews
 * Read-only review list for the launcher. Writing stays on the site.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const includeTesting = await requestIncludesTesting(req);
    const game = await getGame(slug, { includeTesting });
    if (!game) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await dbConnect();
    const docs = await Review.find({ gameSlug: slug, ...gameScopedUgcFilter() })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const origin = new URL(req.url).origin || "https://playbound.club";
    const reviews = docs.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      title: r.title,
      body: String(r.body || "").slice(0, 400),
      username: r.username,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ""),
      url: `${origin}/games/${encodeURIComponent(slug)}?tab=reviews`,
    }));

    return NextResponse.json(
      { reviews },
      {
        headers: {
          "Cache-Control": includeTesting
            ? "private, no-store"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("launcher reviews error:", err);
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  }
}
