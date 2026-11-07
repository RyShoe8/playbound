import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { searchAll } from "@/lib/catalog";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";
import { absoluteMediaUrl } from "@/lib/launcherInstall";

/**
 * GET /api/launcher/search?q= : the non-game halves of the /search page. The
 * launcher already holds the catalog and filters games itself, but it has no
 * editions, developers or collections to search.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const includeTesting = await requestIncludesTesting(req);
    const { editions, developers, collections } = await searchAll(q, { includeTesting });
    return NextResponse.json(
      {
        editions: editions.map(({ edition, game }) => ({
          slug: edition.slug,
          name: edition.name,
          shortDescription: edition.shortDescription ?? null,
          gameSlug: game.slug,
          gameTitle: game.title,
          art: game.art,
          coverImage: absoluteMediaUrl(edition.branding?.heroImage || edition.branding?.screenshots?.[0] || game.coverImage, url.origin),
        })),
        developers: developers.map((d) => ({ slug: d.slug, name: d.name, tagline: d.tagline, artHue: d.artHue })),
        collections: collections.map((c) => ({ slug: c.slug, title: c.title, description: c.description, gameSlugs: c.gameSlugs })),
      },
      {
        headers: {
          "Cache-Control": includeTesting ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    unstable_rethrow(err);
    console.error("Launcher search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
