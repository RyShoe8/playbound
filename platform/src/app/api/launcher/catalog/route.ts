import { NextResponse } from "next/server";
import { listGames } from "@/lib/catalog";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import {
  isPcInstallCandidate,
  toLauncherCatalogEntry,
  type LauncherInstall,
} from "@/lib/launcherInstall";

export async function GET() {
  try {
    const games = await listGames();
    const entries = games
      .filter((g) => isPcInstallCandidate(g))
      .map((g) => {
        const recipe =
          (g.launcherInstall as LauncherInstall | undefined) ||
          launcherInstallBySlug[g.slug] ||
          null;
        if (!recipe?.enabled || !recipe.kind) return null;
        return toLauncherCatalogEntry({
          slug: g.slug,
          title: g.title,
          tagline: g.tagline,
          sizeMB: g.sizeMB,
          art: g.art,
          launcherInstall: recipe,
        });
      })
      .filter(Boolean);

    return NextResponse.json(
      { games: entries },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("launcher catalog error:", err);
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
}
