import { NextResponse } from "next/server";
import { listGames } from "@/lib/catalog";
import { absoluteMediaUrl } from "@/lib/launcherInstall";
import {
  hasServerBrowser,
  listServerBrowserSlugs,
} from "@/lib/servers/registry";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

export async function GET(req: Request) {
  try {
    const includeTesting = await requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const games = await listGames({ includeTesting });
    const providers = listServerBrowserSlugs();

    const entries = games
      .filter((g) => hasServerBrowser(g.slug))
      .map((g) => ({
        slug: g.slug,
        title: g.title,
        supported: true,
        coverImage: absoluteMediaUrl(g.coverImage, origin),
        art: [g.art.from, g.art.to] as [string, string],
        tagline: g.tagline,
        platforms: g.platforms ?? [],
        browserPlayable: Boolean(g.browserPlayable),
        steamDeck: Boolean(g.steamDeck),
        status: g.status || "published",
        testing: g.status === "testing",
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

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
