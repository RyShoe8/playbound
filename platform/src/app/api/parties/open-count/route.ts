import { NextResponse } from "next/server";
import { countOpenPublicParties } from "@/lib/playTogether/party";

/**
 * GET /api/parties/open-count — how many public parties have room right now.
 *
 * Exists so the homepage can show a live number without giving up its CDN
 * cache. The count was previously computed during the page render, which the
 * CDN then froze: create a public party, load the homepage, still 0.
 *
 * The original reason for an endpoint rather than a request-time hole was that
 * Partial Prerendering was not enabled, so any such hole made the whole route
 * dynamic. That is no longer true — the homepage is ◐ now and could stream this
 * from a Suspense boundary instead. The endpoint stays because it still works
 * and the client fetch keeps the number live between revalidations, but the
 * constraint that forced it is gone.
 *
 * Public and unauthenticated: it is a single aggregate count of parties that
 * are already public, and it names none of them.
 */

export async function GET() {
  try {
    const count = await countOpenPublicParties();
    return NextResponse.json(
      { count },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("GET /api/parties/open-count failed:", err);
    // A stat card is not worth a 500 — report zero and let the page render.
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
