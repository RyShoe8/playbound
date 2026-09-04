import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { listGames } from "@/lib/catalog";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import {
  isPcInstallCandidate,
  toLauncherCatalogEntry,
  sizeLabelFromMB,
  absoluteMediaUrl,
  type LauncherInstall,
  hasServerBrowser,
  supportsMultiplayer,
} from "@/lib/launcherInstall";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";
import { gameAccessTiers, tierFor } from "@/lib/access/tiers";
import { accessFieldsForLauncher } from "@/lib/launcherCommerce";
import { formatEditionChipNames } from "@/lib/data/editions";
import { listEditionsForGame } from "@/lib/editions";
import { supportsController } from "@/lib/controller/support";
import { getMultiplayerAdapter } from "@/lib/multiplayer/adapters";

export async function GET(req: Request) {
  try {
    const includeTesting = await requestIncludesTesting(req);
    const origin = new URL(req.url).origin || "https://playbound.club";
    const [games, tiers] = await Promise.all([
      listGames({ includeTesting }),
      gameAccessTiers(),
    ]);
    const entries = (
      await Promise.all(
        games.map(async (g) => {
        const publicActiveEditions = (await listEditionsForGame(g, { includeInactive: false })).filter(
          (edition) => edition.visibility === "public"
        );
        const onlyEdition = publicActiveEditions[0];
        const gameEditions =
          publicActiveEditions.length === 1 &&
          onlyEdition.type === "official" &&
          (onlyEdition.slug === "official" || onlyEdition.slug === "default")
            ? []
            : publicActiveEditions;
        /*
         * Named as a set, not one at a time. Tidying each name alone turned
         * YSoccer's "(Portable)" and "(Tournament)" editions into two rows
         * both called "YSoccer" in the launcher library — see
         * formatEditionChipNames.
         */
        const editionNames = formatEditionChipNames(gameEditions.map((e) => e.name));
        const displayEditions = gameEditions.map((e, i) => ({
          slug: e.slug,
          name: editionNames[i],
          type: e.type,
          isDefault: e.isDefault,
          features: Array.isArray(e.features) ? e.features : [],
          tags: Array.isArray(e.tags) ? e.tags : [],
          hasControllerSupport: supportsController(e),
        }));

        // PC-installable games: full launcher recipe
        if (isPcInstallCandidate(g)) {
          const staticRecipe = launcherInstallBySlug[g.slug] || null;
          const storedRecipe = g.launcherInstall as LauncherInstall | undefined;
          const recipe = storedRecipe
            ? {
                ...staticRecipe,
                ...storedRecipe,
                // Supplemental payloads are curated in source and should not
                // disappear when an older database recipe supplies the base download.
                addons: storedRecipe.addons?.length ? storedRecipe.addons : staticRecipe?.addons,
              }
            : staticRecipe;
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
                /*
                 * How this game's dedicated server is started, so the launcher
                 * can host one on the player's own PC — see
                 * launcher/services/localServer.js. Declared on the multiplayer
                 * adapter rows and, until server control needed it, read by
                 * nothing.
                 */
                hostLaunch: getMultiplayerAdapter(g.slug)?.host ?? null,
                status: g.status || "published",
                testing: g.status === "testing",
                platforms: Array.isArray(g.platforms) ? g.platforms : [],
                browserPlayable: Boolean(g.browserPlayable),
                steamDeck: Boolean(g.steamDeck),
                createdAt: g.createdAt || null,
                editions: displayEditions,
                ...accessFieldsForLauncher(tierFor(tiers, g.slug)),
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
          features: Array.isArray(g.features) ? g.features : [],
          multiplayer: hasServerBrowser(g),
          hasServerBrowser: hasServerBrowser(g),
          isMultiplayer: supportsMultiplayer(g),
          status: g.status || "published",
          testing: g.status === "testing",
          platforms: Array.isArray(g.platforms) ? g.platforms : [],
          browserPlayable: Boolean(g.browserPlayable),
          steamDeck: Boolean(g.steamDeck),
          createdAt: g.createdAt || null,
          editions: displayEditions,
          ...(cover ? { coverImage: cover } : {}),
          ...accessFieldsForLauncher(tierFor(tiers, g.slug)),
        };
        })
      )
    ).filter(Boolean);

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
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("launcher catalog error:", err);
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
}
