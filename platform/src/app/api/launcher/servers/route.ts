import { NextResponse } from "next/server";
import { listGames } from "@/lib/catalog";
import { absoluteMediaUrl } from "@/lib/launcherInstall";
import {
  hasServerProvider,
  isKnownServerGame,
  listProviderSlugs,
} from "@/lib/servers/registry";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

export async function GET(req: Request) {
  try {
    const includeTesting = await requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const games = await listGames({ includeTesting });
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
        platforms: g.platforms ?? [],
        browserPlayable: Boolean(g.browserPlayable),
        steamDeck: Boolean(g.steamDeck),
        status: g.status || "published",
        testing: g.status === "testing",
      }))
      .sort((a, b) => {
        if (a.supported !== b.supported) return a.supported ? -1 : 1;
        return a.title.localeCompare(b.title);
      });

    const authPresent =
      Boolean(req.headers.get("authorization")) || Boolean(req.headers.get("cookie"));

    return NextResponse.json(
      { games: entries, providers },
      {
        headers: {
          // Authenticated / testing payloads must never be served from a shared CDN cache.
          "Cache-Control":
            includeTesting || authPresent
              ? "private, no-store"
              : "public, s-maxage=120, stale-while-revalidate=600",
          Vary: "Cookie, Authorization",
        },
      }
    );
  } catch (err) {
    console.error("launcher servers index error:", err);
    return NextResponse.json({ error: "Failed to load server games" }, { status: 500 });
  }
}
