import { NextResponse } from "next/server";
import { getGame } from "@/lib/catalog";
import { absoluteMediaUrl, sizeLabelFromMB, hasServerBrowser, isMultiplayerGame } from "@/lib/launcherInstall";
import { listMods } from "@/lib/mods";
import { listUnlockedByMaster, toLauncherUnlocks } from "@/lib/masterCopy";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";
import { gameAccessTiers, tierFor } from "@/lib/access/tiers";
import { getStoreAffiliateMap } from "@/lib/commerce/affiliates";
import { accessFieldsForLauncher, toLauncherCommerce } from "@/lib/launcherCommerce";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const includeTesting = await requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const [game, tiers, affiliates] = await Promise.all([
      getGame(slug, { includeTesting }),
      gameAccessTiers(),
      getStoreAffiliateMap(),
    ]);
    if (!game) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const gameTier = tierFor(tiers, slug);

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

    const rawUnlocks = game.masterCopy
      ? await listUnlockedByMaster(slug, { includeTesting })
      : { games: [], editions: [], mods: [] };
    const unlocks = toLauncherUnlocks(rawUnlocks, origin, game);
    const unlockBySlug = new Map(rawUnlocks.games.map((g) => [g.slug, g]));
    const launcherUnlocks = {
      ...unlocks,
      games: unlocks.games.map((entry) => {
        const full = unlockBySlug.get(entry.slug);
        const t = tierFor(tiers, entry.slug);
        return {
          ...entry,
          ...accessFieldsForLauncher(t),
          commerce: toLauncherCommerce(full ?? { slug: entry.slug }, t, affiliates),
        };
      }),
    };

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
        thatOneThing: game.thatOneThing || null,
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
        masterCopy: Boolean(game.masterCopy),
        ...accessFieldsForLauncher(gameTier),
        commerce: toLauncherCommerce(game, gameTier, affiliates),
        unlocks: launcherUnlocks,
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
