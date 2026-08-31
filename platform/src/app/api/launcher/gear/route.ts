import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";
import { absoluteMediaUrl } from "@/lib/launcherInstall";

/**
 * GET /api/launcher/gear
 * Published gear catalog for the desktop app (mirrors site /gear directory).
 */
export async function GET(req: Request) {
  try {
    await dbConnect();
    const origin = new URL(req.url).origin || "https://playbound.club";
    const rows = await Gear.find({ status: "published" })
      .sort({ category: 1, title: 1 })
      .lean();

    const items = rows.map((g) => ({
      slug: g.slug,
      title: g.title,
      category: g.category,
      description: g.description || "",
      manufacturer: g.manufacturer || null,
      playboundCertified: Boolean(g.playboundCertified),
      coverImage: absoluteMediaUrl(g.coverImage, origin),
      affiliateLinks: (g.affiliateLinks || [])
        .filter((l: { isActive?: boolean; url?: string }) => l?.isActive !== false && l?.url)
        .map((l: { retailer: string; url: string; price?: string | null }) => ({
          retailer: l.retailer,
          url: l.url,
          price: l.price || null,
        })),
    }));

    const grouped: Record<string, typeof items> = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }
    const categories = Object.keys(grouped).sort();

    return NextResponse.json(
      { items, categories, grouped },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("launcher gear error:", err);
    return NextResponse.json({ error: "Failed to load gear" }, { status: 500 });
  }
}
