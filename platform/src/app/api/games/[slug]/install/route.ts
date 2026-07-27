import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import {
  defaultLauncherInstallForWebsite,
  isPcInstallCandidate,
  toLauncherCatalogEntry,
  type LauncherInstall,
} from "@/lib/launcherInstall";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isPcInstallCandidate(game)) {
    return NextResponse.json({ error: "Not a launcher-installable title" }, { status: 404 });
  }

  const recipe: LauncherInstall =
    game.launcherInstall ||
    launcherInstallBySlug[game.slug] ||
    defaultLauncherInstallForWebsite(game.website);

  if (!recipe.enabled) {
    return NextResponse.json({ error: "Launcher install disabled" }, { status: 404 });
  }

  return NextResponse.json(
    toLauncherCatalogEntry({
      slug: game.slug,
      title: game.title,
      tagline: game.tagline,
      sizeMB: game.sizeMB,
      art: game.art,
      launcherInstall: recipe,
    }),
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
