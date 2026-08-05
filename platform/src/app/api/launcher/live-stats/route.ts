import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { getMod } from "@/lib/mods";
import {
  getCatalogLiveStats,
  getEditionLiveStats,
  getGameLiveStats,
  getModLiveStats,
} from "@/lib/liveActivity";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

/**
 * GET /api/launcher/live-stats
 * GET /api/launcher/live-stats?game=slug
 * GET /api/launcher/live-stats?mod=slug
 * GET /api/launcher/live-stats?game=slug&edition=slug
 *
 * Thin wrapper over the shared 15-minute liveActivity snapshots.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const gameSlug = url.searchParams.get("game")?.trim() || "";
    const editionSlug = url.searchParams.get("edition")?.trim() || "";
    const modSlug = url.searchParams.get("mod")?.trim() || "";
    const includeTesting = await requestIncludesTesting(req);

    if (modSlug) {
      const mod = await getMod(modSlug, { includeTesting });
      if (!mod) {
        return NextResponse.json({ error: "Mod not found" }, { status: 404 });
      }
      const stats = await getModLiveStats(modSlug);
      return NextResponse.json({ scope: "mod", modSlug, ...stats });
    }

    if (gameSlug && editionSlug) {
      const game = await getGame(gameSlug, { includeTesting });
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      const stats = await getEditionLiveStats(gameSlug, editionSlug);
      return NextResponse.json({
        scope: "edition",
        gameSlug,
        editionSlug,
        ...stats,
      });
    }

    if (gameSlug) {
      const game = await getGame(gameSlug, { includeTesting });
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      const stats = await getGameLiveStats(gameSlug);
      return NextResponse.json({ scope: "game", gameSlug, ...stats });
    }

    const stats = await getCatalogLiveStats();
    return NextResponse.json({ scope: "catalog", ...stats });
  } catch (err) {
    console.error("launcher live-stats error:", err);
    return NextResponse.json({ error: "Failed to load live stats" }, { status: 500 });
  }
}
