import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import CatalogGame from "@/lib/models/CatalogGame";
import { requireAdminSession } from "@/lib/requireAdmin";
import { editions as seedEditions } from "@/lib/data/editions";

/**
 * POST /api/admin/editions/materialize — write seed editions into MongoDB.
 *
 * Editions resolve from two places: stored rows, and the seed file merged in
 * for any slug the database does not have (src/lib/editions.ts →
 * loadStoredForGame). That fallback keeps the catalog working before anything
 * is stored, but it means a seed-only edition is not a record anyone can
 * curate — it cannot be edited in admin without being created first, and its
 * content only changes by shipping code.
 *
 * This creates the missing rows so every edition is a real document, after
 * which the seed is a fallback that never fires.
 *
 * Deliberately additive, and narrower than scripts/seed-editions.ts on purpose:
 *
 *   - Only inserts pairs that are absent. An edition already curated in the
 *     database is never updated, so no field of it can be overwritten.
 *   - NEVER writes to CatalogGame. seed-editions.ts promotes parent games to
 *     published as a side effect; nothing here may do that. CatalogGame is read
 *     only, and only to resolve the gameId reference. Keep it that way — game
 *     content is curated in admin and must not move because an edition landed.
 *
 * Body accepts { gameSlug?: string, dryRun?: boolean }.
 */
export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const gameSlug: string | null =
      typeof body?.gameSlug === "string" && body.gameSlug ? body.gameSlug : null;
    const dryRun = body?.dryRun === true;

    await dbConnect();

    const candidates = seedEditions.filter((s) => !gameSlug || s.gameSlug === gameSlug);
    if (candidates.length === 0) {
      return NextResponse.json({ created: [], skipped: [], dryRun });
    }

    // One query for every pair in play rather than one per edition.
    const slugs = [...new Set(candidates.map((s) => s.gameSlug))];
    const stored = await EditionModel.find({ gameSlug: { $in: slugs } })
      .select("gameSlug slug isDefault")
      .lean();
    const storedKeys = new Set(
      stored.map((e) => `${String(e.gameSlug)}:${String(e.slug)}`)
    );
    // Games that already have a default. A seed marked isDefault must not
    // create a second one, and clearing the existing row's flag would be the
    // kind of overwrite this endpoint refuses to do — so the new row yields.
    const gamesWithDefault = new Set(
      stored.filter((e) => e.isDefault).map((e) => String(e.gameSlug))
    );

    const games = await CatalogGame.find({ slug: { $in: slugs } })
      .select("_id slug")
      .lean();
    const gameIdBySlug = new Map(games.map((g) => [String(g.slug), g._id]));

    const created: string[] = [];
    const skipped: string[] = [];

    for (const seed of candidates) {
      const key = `${seed.gameSlug}:${seed.slug}`;
      if (storedKeys.has(key)) {
        skipped.push(`${key} (already stored)`);
        continue;
      }
      if (!gameIdBySlug.has(seed.gameSlug)) {
        // No parent game in the catalog — writing this would orphan the row.
        skipped.push(`${key} (no such game)`);
        continue;
      }
      const wouldDuplicateDefault = seed.isDefault && gamesWithDefault.has(seed.gameSlug);
      if (!dryRun) {
        await EditionModel.create({
          ...seed,
          ...(wouldDuplicateDefault ? { isDefault: false } : {}),
          gameId: gameIdBySlug.get(seed.gameSlug) ?? null,
        });
      }
      if (seed.isDefault && !wouldDuplicateDefault) gamesWithDefault.add(seed.gameSlug);
      created.push(wouldDuplicateDefault ? `${key} (not default — game already has one)` : key);
    }

    return NextResponse.json({ created, skipped, dryRun });
  } catch (err) {
    console.error("POST /api/admin/editions/materialize failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
