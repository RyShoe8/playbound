import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getGame } from "@/lib/catalog";
import { deriveInstallSteps } from "@/lib/enrich";
import { absoluteMediaUrl, sizeLabelFromMB, hasServerBrowser, supportsMultiplayer } from "@/lib/launcherInstall";
import { listMods } from "@/lib/mods";
import { listDevelopers } from "@/lib/developers";
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
    const testingPromise = requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const [game, tiers, affiliates, developers, gameMods] = await Promise.all([
      testingPromise.then((includeTesting) => getGame(slug, { includeTesting })),
      gameAccessTiers(),
      getStoreAffiliateMap(),
      listDevelopers(),
      testingPromise.then((includeTesting) => listMods({ baseGameSlug: slug, includeTesting, view: "card" })),
    ]);
    const includeTesting = await testingPromise;
    if (!game) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const gameTier = tierFor(tiers, slug);

    const baseCover = absoluteMediaUrl(game.coverImage, origin);
    const mods = gameMods.map((m) => ({
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
      : { games: [], editions: [], standaloneGames: [], standaloneEditions: [], mods: [] };
    const unlocks = toLauncherUnlocks(rawUnlocks, origin, game);
    const unlockBySlug = new Map(rawUnlocks.games.map((g) => [g.slug, g]));
    for (const g of rawUnlocks.standaloneGames ?? []) {
      unlockBySlug.set(g.slug, g);
    }

    const enrichGame = (entry: (typeof unlocks.games)[number]) => {
      const full = unlockBySlug.get(entry.slug);
      const t = tierFor(tiers, entry.slug);
      return {
        ...entry,
        ...accessFieldsForLauncher(t),
        commerce: toLauncherCommerce(full ?? { slug: entry.slug }, t, affiliates),
      };
    };

    const launcherUnlocks = {
      ...unlocks,
      games: unlocks.games.map(enrichGame),
      standaloneGames: unlocks.standaloneGames.map(enrichGame),
    };

    return NextResponse.json(
      {
        slug: game.slug,
        title: game.title,
        blurb: game.tagline,
        description: game.description,
        longDescription: game.longDescription || null,
        features: game.features || [],
        genres: game.genres || [],
        tags: game.tags || [],
        approxSize: sizeLabelFromMB(game.sizeMB) || null,
        /*
         * The launcher's Game Details sidebar reads these directly. Without
         * them it fell back to "Independent" / "Free" / "—" for every
         * game, so Release always read as empty and Developer and License
         * showed placeholders rather than the curated values.
         */
        releaseYear: game.releaseYear || null,
        license: game.license || null,
        developer:
          developers.find((d) => d.slug === game.developerSlug)?.name ||
          game.developerSlug ||
          null,
        version: game.launcherInstall?.versionLabel || game.launcherInstall?.detectedVersion || null,
        art: [game.art.from, game.art.to],
        coverImage: absoluteMediaUrl(game.coverImage, origin),
        screenshots: (game.screenshots || [])
          .map((s) => absoluteMediaUrl(s, origin))
          .filter(Boolean),
        videos: Array.isArray(game.videos) ? game.videos.filter(Boolean) : [],
        systemRequirements: game.systemRequirements || null,
        hardwareRequirements: game.hardwareRequirements || null,
        // Same block the web controls page renders, so the two cannot drift.
        controls: game.controls || null,
        installSteps:
          Array.isArray(game.installSteps) && game.installSteps.length > 0
            ? game.installSteps
            : deriveInstallSteps(game),
        firstPlaySteps: Array.isArray(game.firstPlaySteps) ? game.firstPlaySteps : [],
        multiplayerGamingSteps: Array.isArray(game.multiplayerGamingSteps)
          ? game.multiplayerGamingSteps
          : [],
        faq: Array.isArray(game.faq) ? game.faq : [],
        bestFor: Array.isArray(game.bestFor) ? game.bestFor : [],
        notFor: Array.isArray(game.notFor) ? game.notFor : [],
        whyWePickedIt: game.whyWePickedIt || null,
        thatOneThing: game.thatOneThing || null,
        qualityBar: game.qualityBar || null,
        multiplayer: hasServerBrowser(game),
        hasServerBrowser: hasServerBrowser(game),
        isMultiplayer: supportsMultiplayer(game),
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
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("launcher game detail error:", err);
    return NextResponse.json({ error: "Failed to load game" }, { status: 500 });
  }
}
