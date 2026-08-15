import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { absoluteMediaUrl, sizeLabelFromMB, hasServerBrowser, isMultiplayerGame } from "@/lib/launcherInstall";
import { listMods } from "@/lib/mods";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const includeTesting = await requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const game = await getGame(slug, { includeTesting });
    if (!game) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const baseCover = absoluteMediaUrl(game.coverImage, origin);
    const mods = (await listMods({ baseGameSlug: slug, includeTesting, view: "card" })).map((m) => ({
      slug: m.slug,
      title: m.title,
      tagline: m.tagline,
      coverImage: absoluteMediaUrl(m.coverImage, origin),
      baseGameCoverImage: baseCover,
      approxSize: sizeLabelFromMB(m.sizeMB) || null,
      art: [m.art.from, m.art.to] as [string, string],
      downloadKind: m.downloadKind,
      platforms: Array.isArray(m.platforms) ? m.platforms : [],
      status: m.status || "published",
      testing: m.status === "testing",
    }));

    return NextResponse.json(
      {
        slug: game.slug,
        title: game.title,
        blurb: game.tagline,
        description: game.description,
        features: game.features || [],
        genres: game.genres || [],
        tags: game.tags || [],
        approxSize: sizeLabelFromMB(game.sizeMB) || null,
        art: [game.art.from, game.art.to],
        coverImage: absoluteMediaUrl(game.coverImage, origin),
        screenshots: (game.screenshots || [])
          .map((s) => absoluteMediaUrl(s, origin))
          .filter(Boolean),
        videos: Array.isArray(game.videos) ? game.videos.filter(Boolean) : [],
        systemRequirements: game.systemRequirements || null,
        hardwareRequirements: game.hardwareRequirements || null,
        faq: Array.isArray(game.faq) ? game.faq : [],
        bestFor: Array.isArray(game.bestFor) ? game.bestFor : [],
        notFor: Array.isArray(game.notFor) ? game.notFor : [],
        whyWePickedIt: game.whyWePickedIt || null,
        qualityBar: game.qualityBar || null,
        multiplayer: hasServerBrowser(game),
        hasServerBrowser: hasServerBrowser(game),
        isMultiplayer: isMultiplayerGame(game),
        website: game.website || null,
        githubRepo: game.githubRepo || null,
        platforms: Array.isArray(game.platforms) ? game.platforms : [],
        browserPlayable: Boolean(game.browserPlayable),
        steamDeck: Boolean(game.steamDeck),
        status: game.status || "published",
        testing: game.status === "testing",
        mods,
      },
      {
        headers: {
          "Cache-Control": includeTesting
            ? "private, no-store"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    console.error("launcher game detail error:", err);
    return NextResponse.json({ error: "Failed to load game" }, { status: 500 });
  }
}
