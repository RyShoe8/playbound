import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import dbConnect from "@/lib/db";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { gameScopedUgcFilter } from "@/lib/ugcTarget";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

/**
 * GET /api/launcher/games/[slug]/discussions
 * Read-only topic list for the launcher. Creating topics stays on the site.
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
    const docs = await DiscussionTopic.find({
      gameSlug: slug,
      ...gameScopedUgcFilter(),
      status: { $ne: "removed" },
    })
      .sort({ isPinned: -1, lastReplyAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    const origin = new URL(req.url).origin || "https://playbound.club";
    const topics = docs.map((t) => ({
      id: String(t._id),
      title: t.title,
      category: t.category,
      username: t.authorUsername,
      replyCount: t.replyCount ?? 0,
      isPinned: Boolean(t.isPinned),
      isSolved: Boolean(t.isSolved),
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt || ""),
      url: `${origin}/games/${encodeURIComponent(slug)}/discussion/${encodeURIComponent(String(t.slug || t._id))}`,
    }));

    return NextResponse.json(
      {
        topics,
        boardUrl: `${origin}/games/${encodeURIComponent(slug)}?tab=discussion`,
      },
      {
        headers: {
          "Cache-Control": includeTesting
            ? "private, no-store"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("launcher discussions error:", err);
    return NextResponse.json({ error: "Failed to load discussions" }, { status: 500 });
  }
}
