import { NextResponse } from "next/server";
import { getRatings } from "@/lib/ratingsData";
import { resolveEditorialTarget } from "@/lib/editorialReviewTarget";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

/**
 * Editorial Rating, Community Rating and the outlet snippets for a game, or
 * for one edition with ?edition=<slug>. Read by the launcher and anything else
 * that is not a server-rendered page. Launchers allowed to see Testing games
 * get those too, uncached, as on the other launcher routes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const includeTesting = await requestIncludesTesting(req);
  const target = await resolveEditorialTarget(slug, new URL(req.url).searchParams.get("edition"), { includeTesting });
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
  const ratings = await getRatings(slug, target.edition?.slug ?? null, { baseGame: Boolean(target.edition?.virtual) });
  return NextResponse.json(ratings, {
    headers: { "Cache-Control": includeTesting ? "private, no-store" : "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
