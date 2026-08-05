import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import dbConnect from "@/lib/db";
import GuidePost from "@/lib/models/GuidePost";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

/**
 * GET /api/launcher/games/[slug]/guides
 * Lightweight guide list — open the site guide tab for full reading/writing.
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
    const docs = await GuidePost.find({ gameSlug: slug })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const origin = new URL(req.url).origin || "https://playbound.club";
    const guides = docs.map((g) => ({
      id: String(g._id),
      title: g.title,
      username: g.username,
      createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : String(g.createdAt),
      excerpt: String(g.body || "").slice(0, 280),
      url: `${origin}/games/${encodeURIComponent(slug)}?tab=guides`,
    }));

    return NextResponse.json(
      { guides },
      {
        headers: {
          "Cache-Control": includeTesting
            ? "private, no-store"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("launcher guides error:", err);
    return NextResponse.json({ error: "Failed to load guides" }, { status: 500 });
  }
}
