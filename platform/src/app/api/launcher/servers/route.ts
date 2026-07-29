import { NextResponse } from "next/server";
import { listGames } from "@/lib/catalog";
import { absoluteMediaUrl } from "@/lib/launcherInstall";
import {
  hasServerProvider,
  isKnownServerGame,
  listProviderSlugs,
} from "@/lib/servers/registry";

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin || "https://playbound.club";
    const games = await listGames();
    const providers = listProviderSlugs();

    const entries = games
      .filter(
        (g) =>
          g.launchMethods?.includes("server") || isKnownServerGame(g.slug)
      )
      .map((g) => ({
        slug: g.slug,
        title: g.title,
        supported: hasServerProvider(g.slug),
        coverImage: absoluteMediaUrl(g.coverImage, origin),
        art: [g.art.from, g.art.to] as [string, string],
        tagline: g.tagline,
      }))
      .sort((a, b) => {
        if (a.supported !== b.supported) return a.supported ? -1 : 1;
        return a.title.localeCompare(b.title);
      });

    return NextResponse.json(
      { games: entries, providers },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } }
    );
  } catch (err) {
    console.error("launcher servers index error:", err);
    return NextResponse.json({ error: "Failed to load server games" }, { status: 500 });
  }
}
