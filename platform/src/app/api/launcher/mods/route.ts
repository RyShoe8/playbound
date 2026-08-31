import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { absoluteMediaUrl, sizeLabelFromMB } from "@/lib/launcherInstall";
import { listGames } from "@/lib/catalog";
import { listMods } from "@/lib/mods";
import { hasServerProvider, isKnownServerGame } from "@/lib/servers/registry";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";
import { canonicalCatalogGameSlug } from "@/lib/catalogGameAliases";

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

    const baseGameForMod = (modBaseGameSlug: string) => {
      const canonical = canonicalCatalogGameSlug(modBaseGameSlug);
      return gameBySlug.get(canonical) || gameBySlug.get(modBaseGameSlug) || null;
    };

    // A mod's own status can be published while its base game is still a
    // draft — nothing enforces the two together. Drop those here: the
    // launcher has no page to show for a game that isn't live yet, so a mod
    // for one would be an install button that leads nowhere.
    const entries = mods
      .filter((m) => baseGameForMod(m.baseGameSlug))
      .map((m) => {
        const canonical = canonicalCatalogGameSlug(m.baseGameSlug);
        const base = baseGameForMod(m.baseGameSlug);
        return {
          slug: m.slug,
          title: m.title,
          baseGameSlug: canonical,
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
            hasServerProvider(canonical) || isKnownServerGame(canonical),
          baseSupported: hasServerProvider(canonical),
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
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("launcher mods error:", err);
    return NextResponse.json({ error: "Failed to load mods" }, { status: 500 });
  }
}
