import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { listActiveOffers } from "@/lib/freeOffers/service";
import { listDiscountedGames } from "@/lib/deals";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";
import { absoluteMediaUrl } from "@/lib/launcherInstall";

/**
 * GET /api/launcher/deals — what the launcher's Game Deals view renders.
 *
 * One endpoint rather than two, because the view needs both halves to decide
 * what to draw and a single round trip means it cannot render the free section
 * and then jump as the discounts arrive.
 *
 * The website's /deals page deliberately does **not** call this. It is a server
 * component and reads `listActiveOffers` / `listDiscountedGames` directly; going
 * through HTTP would add a hop and a second cache with no benefit. This route
 * exists for the desktop app, which has no other way in.
 *
 * `/api/free-offers` stays exactly as it is — the launcher's Home row still
 * reads it, and changing its shape would break older installed builds.
 *
 * `discounted` applies the same DEEP_DISCOUNT_MIN_PERCENT bar as the website,
 * because it calls the same helper, which now scans the stores directly rather
 * than PlayBound's own catalog — see lib/deals.ts. `includeTesting` no longer
 * applies to that half: a store discount was never a draft/testing catalog row
 * to begin with, so it stays only on the free-offers query below.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const origin = url.origin || "https://playbound.club";
    const includeTesting = await requestIncludesTesting(req);

    const [freeOffers, discounted] = await Promise.all([
      listActiveOffers(),
      listDiscountedGames(),
    ]);

    return NextResponse.json(
      {
        /*
         * Offers pass through unchanged so the launcher can reuse the card
         * builder it already has for /api/free-offers.
         */
        freeOffers,
        /*
         * Covers are absolutised for the same reason the editions endpoint does
         * it: the launcher renders from a file:// page, where a root-relative
         * path resolves against the local filesystem and the image is simply
         * missing.
         */
        discounted: discounted.map((game) => ({
          ...game,
          coverImage: absoluteMediaUrl(game.coverImage, origin),
        })),
        count: freeOffers.length + discounted.length,
        at: new Date().toISOString(),
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
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("Launcher deals error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
