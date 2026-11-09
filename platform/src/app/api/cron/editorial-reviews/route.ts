import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { cronAuthorized } from "@/lib/cronAuth";
import { syncEditorialReviews, syncOutletFeeds, type SyncResult } from "@/lib/editorialReviews/sync";
import { allSyncTargets, staleSyncTargets } from "@/lib/editorialReviews/targets";
import { ratingsTag } from "@/lib/ratingsData";

export const maxDuration = 60;

/** Targets per run (Wikipedia plus a search of each outlet). Hourly runs cycle the catalogue in about two days. */
const BATCH = 9;
/** Stop starting new work once this much of the run is used. */
const TIME_BUDGET_MS = 42_000;

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

/**
 * Automated Editorial Rating gathering: refresh the stalest targets from their
 * Wikipedia review tables and each searchable outlet, then read the
 * feed-only outlets for new reviews. Writes only the EditorialReview and
 * EditorialReviewSource collections, never catalog content.
 */
async function run(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const targets = await staleSyncTargets(BATCH);
  const snippetBudget = { left: 30 };
  const results: SyncResult[] = [];
  for (const target of targets) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    results.push(await syncEditorialReviews(target, { snippetBudget }));
  }
  // Feed-only outlets (Polygon, Multiplayer.it…): new reviews of any target.
  const fromFeeds = Date.now() - started < TIME_BUDGET_MS ? await syncOutletFeeds(await allSyncTargets()).catch(() => []) : [];
  const touched = new Set([...results.filter((r) => r.added || r.updated).map((r) => r.gameSlug), ...fromFeeds.map((f) => f.gameSlug)]);
  for (const slug of touched) {
    revalidateTag(ratingsTag(slug), { expire: 0 });
  }
  return NextResponse.json({
    synced: results.length,
    added: results.reduce((n, r) => n + r.added, 0) + fromFeeds.length,
    fromFeeds,
    results: results.map((r) => ({ target: `${r.gameSlug}${r.editionSlug ? `/${r.editionSlug}` : ""}`, status: r.status, article: r.article, found: r.found, added: r.added })),
  });
}
