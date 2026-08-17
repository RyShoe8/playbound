import { NextResponse } from "next/server";
import { listGames } from "@/lib/catalog";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import {
  isPcInstallCandidate,
  toLauncherCatalogEntry,
  sizeLabelFromMB,
  absoluteMediaUrl,
  type LauncherInstall,
  hasServerBrowser,
  isMultiplayerGame,
} from "@/lib/launcherInstall";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

export async function GET(req: Request) {
  try {
    const includeTesting = await requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const games = await listGames({ includeTesting });
    const entries = games
      .map((g) => {
        // PC-installable games: full launcher recipe
        if (isPcInstallCandidate(g)) {
          const recipe =
            (g.launcherInstall as LauncherInstall | undefined) ||
            launcherInstallBySlug[g.slug] ||
            null;
          if (!recipe?.enabled || !recipe.kind) return null;
          const entry = toLauncherCatalogEntry({
            slug: g.slug,
            title: g.title,
            tagline: g.tagline,
            sizeMB: g.sizeMB,
            art: g.art,
            launcherInstall: recipe,
            coverImage: g.coverImage,
            genres: g.genres,
            tags: g.tags,
            launchMethods: g.launchMethods,
            features: g.features,
            origin,
          });
          return entry
            ? {
                ...entry,
                status: g.status || "published",
                testing: g.status === "testing",
                platforms: Array.isArray(g.platforms) ? g.platforms : [],
                browserPlayable: Boolean(g.browserPlayable),
                steamDeck: Boolean(g.steamDeck),
                createdAt: g.createdAt || null,
              }
            : null;
        }

        // Browser / non-installable games: external entry → opens website
        const cover = absoluteMediaUrl(g.coverImage, origin);
        return {
          slug: g.slug,
          title: g.title,
          blurb: g.tagline,
          kind: "external" as const,
          url: g.website,
          art: [g.art.from, g.art.to],
          approxSize: sizeLabelFromMB(g.sizeMB) ?? "Browser",
          genres: Array.isArray(g.genres) ? g.genres : [],
          tags: Array.isArray(g.tags) ? g.tags : [],
          launchMethods: Array.isArray(g.launchMethods) ? g.launchMethods : [],
          multiplayer: hasServerBrowser(g),
          hasServerBrowser: hasServerBrowser(g),
          isMultiplayer: isMultiplayerGame(g),
          status: g.status || "published",
          testing: g.status === "testing",
          platforms: Array.isArray(g.platforms) ? g.platforms : [],
          browserPlayable: Boolean(g.browserPlayable),
          steamDeck: Boolean(g.steamDeck),
          createdAt: g.createdAt || null,
          ...(cover ? { coverImage: cover } : {}),
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      { games: entries },
      {
        headers: {
          "Cache-Control": includeTesting
            ? "private, no-store"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("launcher catalog error:", err);
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
}
