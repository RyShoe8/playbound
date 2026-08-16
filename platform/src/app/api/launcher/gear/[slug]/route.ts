import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";
import GearRecommendation from "@/lib/models/GearRecommendation";
import Review from "@/lib/models/Review";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { getGame } from "@/lib/catalog";
import { gearScopedUgcFilter } from "@/lib/ugcTarget";
import { averageRating } from "@/components/reviews/ReviewList";
import { absoluteMediaUrl } from "@/lib/launcherInstall";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    await dbConnect();
    const origin = new URL(req.url).origin || "https://playbound.club";

    const gear = await Gear.findOne({ slug, status: "published" }).lean();
    if (!gear) {
      return NextResponse.json({ error: "Gear not found" }, { status: 404 });
    }

    const recommendations = await GearRecommendation.find({ gearSlug: gear.slug }).lean();
    const recommendedGames = [];
    for (const rec of recommendations) {
      const game = await getGame(rec.gameSlug);
      if (game) {
        recommendedGames.push({
          slug: game.slug,
          title: game.title,
          coverImage: absoluteMediaUrl(game.coverImage, origin),
          reason: rec.reason || null,
        });
      }
    }

    const reviewDocs = await Review.find({ ...gearScopedUgcFilter(gear.slug) })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const reviewCount = await Review.countDocuments({ ...gearScopedUgcFilter(gear.slug) });
    const avg = averageRating(reviewDocs);

    const discussionDocs = await DiscussionTopic.find({
      ...gearScopedUgcFilter(gear.slug),
      status: { $ne: "removed" },
    })
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(30)
      .lean();

    const discussionCount = await DiscussionTopic.countDocuments({
      ...gearScopedUgcFilter(gear.slug),
      status: { $ne: "removed" },
    });

    const activeLinks = (gear.affiliateLinks || [])
      .filter((l: { isActive?: boolean; url?: string }) => l?.isActive !== false && l?.url)
      .map((l: { retailer: string; url: string; price?: string | null; shipping?: string | null }) => ({
        retailer: l.retailer,
        url: l.url,
        price: l.price || null,
        shipping: l.shipping || null,
      }));

    return NextResponse.json(
      {
        gear: {
          slug: gear.slug,
          title: gear.title,
          category: gear.category,
          description: gear.description || "",
          manufacturer: gear.manufacturer || null,
          playboundCertified: Boolean(gear.playboundCertified),
          coverImage: absoluteMediaUrl(gear.coverImage, origin),
          screenshots: (gear.screenshots || []).map((s: string) => absoluteMediaUrl(s, origin)),
          videos: gear.videos || [],
          platforms: gear.platforms || [],
          bestFor: gear.bestFor || [],
          affiliateLinks: activeLinks,
        },
        recommendedGames,
        reviews: reviewDocs.map((r: any) => ({
          id: String(r._id),
          authorName: r.authorName || "Anonymous",
          rating: r.rating,
          title: r.title || "",
          body: r.body || "",
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        })),
        avgRating: avg,
        reviewCount,
        discussions: discussionDocs.map((d: any) => ({
          id: String(d._id),
          title: d.title,
          category: d.category,
          authorName: d.authorName || "Anonymous",
          replyCount: d.replyCount || 0,
          isPinned: Boolean(d.isPinned),
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
        })),
        discussionCount,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("launcher gear detail error:", err);
    return NextResponse.json({ error: "Failed to load gear detail" }, { status: 500 });
  }
}
