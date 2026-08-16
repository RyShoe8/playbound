import { NextResponse } from "next/server";
import { countOpenPublicParties } from "@/lib/playTogether/party";

/**
 * GET /api/parties/open-count — how many public parties have room right now.
 *
 * Exists so the homepage can show a live number without giving up its CDN
 * cache. The count was previously computed during the page render, which the
 * CDN then froze: create a public party, load the homepage, still 0. Partial
 * Prerendering is not enabled, so a request-time hole in that page would make
 * the whole route dynamic — this keeps the page cached and moves just the
 * number to the client.
 *
 * Public and unauthenticated: it is a single aggregate count of parties that
 * are already public, and it names none of them.
 */
export const dynamic = "force-dynamic";

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
