import { NextResponse } from "next/server";
import { listActiveOffers } from "@/lib/freeOffers/service";

/**
 * Public JSON API for currently active free-game offers.
 *
 * Useful for future Discord bot integration, external consumers, etc.
 * Reads from the cached service layer — no direct store API calls.
 */
export async function GET() {
  const offers = await listActiveOffers();
  return NextResponse.json(
    { offers, count: offers.length, at: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
