import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { fetchGithubReleases } from "@/lib/github";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

/**
 * GET /api/launcher/games/[slug]/releases
 * GitHub releases when the game has a githubRepo; otherwise empty list.
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const releases = game.githubRepo ? await fetchGithubReleases(game.githubRepo, 10) : [];

    return NextResponse.json(
      { githubRepo: game.githubRepo || null, releases },
      {
        headers: {
          "Cache-Control": includeTesting
            ? "private, no-store"
            : "public, s-maxage=300, stale-while-revalidate=900",
        },
      }
    );
  } catch (err) {
    console.error("launcher releases error:", err);
    return NextResponse.json({ error: "Failed to load releases" }, { status: 500 });
  }
}
