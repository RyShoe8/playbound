import { NextResponse } from "next/server";
import { countLookingToParty } from "@/lib/playTogether/lookingToParty";

/**
 * GET /api/presence/lfg/count — how many people are looking to party right now.
 *
 * Client-fetched for the same reason as /api/parties/open-count: the homepage
 * is CDN-cached and PPR is not enabled, so computing this during render would
 * either freeze the number or make the whole route dynamic.
 *
 * Public and unauthenticated — a single aggregate that names nobody.
 */

export async function GET() {
  try {
    const count = await countLookingToParty();
    return NextResponse.json({ count }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("GET /api/presence/lfg/count failed:", err);
    // A stat card is not worth a 500.
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
