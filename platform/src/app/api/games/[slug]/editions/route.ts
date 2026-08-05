import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { listEditionsForGame } from "@/lib/editions";
import { resolveInstallAction } from "@/lib/editionInstall";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

/**
 * GET /api/games/:slug/editions
 *
 * Every edition for a game, in display order. Always returns at least one —
 * a game with none stored yields its synthesized Official edition — so the
 * launcher and any client can assume the list is non-empty.
 *
 * Games are addressed by slug rather than ObjectId because that is the
 * identifier used across the site, the launcher and the public URLs, and
 * static seed games have no ObjectId at all.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const includeTesting = await requestIncludesTesting(req);
    const game = await getGame(slug, { includeTesting });
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const editions = await listEditionsForGame(game);
    const publicEditions = editions.filter((e) => e.visibility !== "hidden");

    return NextResponse.json({
      game: { slug: game.slug, title: game.title },
      editions: publicEditions.map((edition) => ({
        ...edition,
        // Precomputed so clients (including the launcher) don't reimplement
        // method-to-action mapping.
        installAction: resolveInstallAction(edition),
      })),
    });
  } catch (err) {
    console.error("List editions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
