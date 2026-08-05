import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import {
  defaultLauncherInstallForWebsite,
  isPcInstallCandidate,
  toLauncherCatalogEntry,
  type LauncherInstall,
} from "@/lib/launcherInstall";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const includeTesting = await requestIncludesTesting(req);
  const origin = new URL(req.url).origin || "https://playbound.club";
  const game = await getGame(slug, { includeTesting });
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

  const entry = toLauncherCatalogEntry({
    slug: game.slug,
    title: game.title,
    tagline: game.tagline,
    sizeMB: game.sizeMB,
    art: game.art,
    launcherInstall: recipe,
    coverImage: game.coverImage,
    genres: game.genres,
    tags: game.tags,
    launchMethods: game.launchMethods,
    origin,
  });

  return NextResponse.json(
    { ...entry, status: game.status || "published", testing: game.status === "testing" },
    {
      headers: {
        "Cache-Control": includeTesting
          ? "private, no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
