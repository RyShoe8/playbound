import { NextResponse } from "next/server";
import { absoluteMediaUrl, sizeLabelFromMB } from "@/lib/launcherInstall";
import { listGames } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { hasServerProvider, isKnownServerGame } from "@/lib/servers/registry";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

export async function GET(req: Request) {
  try {
    const includeTesting = await requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const baseGameSlug = new URL(req.url).searchParams.get("baseGameSlug") || undefined;
    const classification = new URL(req.url).searchParams.get("classification") || undefined;
    const [mods, games] = await Promise.all([
      listMods({
        ...(baseGameSlug ? { baseGameSlug } : {}),
        ...(classification ? { classification } : {}),
        includeTesting,
        view: "card",
      }),
      listGames({ includeTesting }),
    ]);
    const gameBySlug = new Map(games.map((g) => [g.slug, g]));

    // A mod's own status can be published while its base game is still a
    // draft — nothing enforces the two together. Drop those here: the
    // launcher has no page to show for a game that isn't live yet, so a mod
    // for one would be an install button that leads nowhere.
    const entries = mods
      .filter((m) => gameBySlug.has(m.baseGameSlug))
      .map((m) => {
        const base = gameBySlug.get(m.baseGameSlug);
        return {
          slug: m.slug,
          title: m.title,
          baseGameSlug: m.baseGameSlug,
          baseGameTitle: base?.title,
          tagline: m.tagline,
          whatItChanges: m.whatItChanges || m.tagline || null,
          coverImage: absoluteMediaUrl(m.coverImage, origin),
          baseGameCoverImage: absoluteMediaUrl(base?.coverImage, origin),
          downloadKind: m.downloadKind,
          approxSize: sizeLabelFromMB(m.sizeMB) || null,
          art: [m.art.from, m.art.to] as [string, string],
          platforms: Array.isArray(m.platforms) ? m.platforms : [],
          tags: m.tags || [],
          classificationIds: m.classificationIds || [],
          status: m.status || "published",
          testing: m.status === "testing",
          baseHasServers:
            hasServerProvider(m.baseGameSlug) || isKnownServerGame(m.baseGameSlug),
          baseSupported: hasServerProvider(m.baseGameSlug),
        };
      });

    return NextResponse.json(
      { mods: entries },
      {
        headers: {
          "Cache-Control": includeTesting
            ? "private, no-store"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("launcher mods error:", err);
    return NextResponse.json({ error: "Failed to load mods" }, { status: 500 });
  }
}
