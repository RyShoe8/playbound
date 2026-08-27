import { NextResponse } from "next/server";
import { getGame, listGames } from "@/lib/catalog";
import { listEditionsForGame } from "@/lib/editions";
import { resolveInstallAction } from "@/lib/editionInstall";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";
import { absoluteMediaUrl } from "@/lib/launcherInstall";
import type { Edition } from "@/lib/editionTypes";

/**
 * GET /api/launcher/editions          — every installable edition
 * GET /api/launcher/editions?game=…   — editions for one game
 *
 * The launcher installs Editions, not Games. This is the metadata endpoint it
 * reads: each entry carries the parent game's identity plus the edition's own
 * install recipe, so the desktop app can install "Turtle WoW" rather than
 * "World of Warcraft".
 *
 * Games with no stored editions still appear here, represented by their
 * synthesized Official edition. That is what lets an existing launcher build
 * keep working unchanged while a newer one becomes edition-aware.
 */

/** Editions the desktop launcher can actually act on. */
function isLauncherInstallable(edition: Edition): boolean {
  if (edition.status === "archived" || edition.status === "coming_soon") return false;
  return (
    edition.installMethod === "playbound_installer" ||
    edition.installMethod === "official_download" ||
    edition.installMethod === "external_installer"
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const origin = url.origin || "https://playbound.club";
    const gameSlug = url.searchParams.get("game");
    const includeTesting = await requestIncludesTesting(req);

    const games = gameSlug
      ? [await getGame(gameSlug, { includeTesting })].filter((g) => g != null)
      : await listGames({ includeTesting });

    if (gameSlug && games.length === 0) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const entries = [];
    for (const game of games) {
      const editions = await listEditionsForGame(game);
      for (const edition of editions) {
        if (edition.visibility !== "public") continue;
        if (!isLauncherInstallable(edition)) continue;

        entries.push({
          // Identity — every launcher analytics event echoes these back.
          gameSlug: game.slug,
          gameTitle: game.title,
          editionId: edition.id,
          editionSlug: edition.slug,
          editionName: edition.name,
          editionType: edition.type,
          isDefault: edition.isDefault,
          virtual: edition.virtual,

          shortDescription: edition.shortDescription || game.tagline,
          description: edition.description || "",
          faq: Array.isArray(edition.faq) ? edition.faq : [],
          version: edition.version ?? null,
          verificationLevel: edition.verificationLevel,
          verified: edition.verified,
          tags: edition.tags || [],
          features: edition.features || [],
          genres: game.genres || [],
          /*
           * Edition first, game as fallback — same pattern as sizeMB below.
           * An edition can run somewhere its base game's own platforms list
           * does not: OpenMoHAA is a Linux/macOS-native rebuild of a
           * Windows-only retail game, and reporting the game's platforms
           * here told party cross-platform filtering (partyPlatforms.ts)
           * that Linux players could not play a game one of its own editions
           * runs natively.
           */
          platforms: (Array.isArray(edition.platforms) && edition.platforms.length > 0
            ? edition.platforms
            : game.platforms) || [],

          art: game.art,
          /*
           * Absolute, always. Editions may store a site-relative path like
           * "/games/holocure/editions/playbound.jpg", which the website
           * resolves fine — but the launcher renders from a file:// page, so a
           * leading slash points at the local filesystem and the image is
           * simply broken. The launcher catalog endpoint already absolutises
           * game covers this way; editions were missed.
           */
          coverImage: absoluteMediaUrl(
            edition.branding.heroImage ?? game.coverImage ?? null,
            origin
          ),
          sizeMB: edition.installConfig.official_download?.sizeMB ?? game.sizeMB,

          installMethod: edition.installMethod,
          // The recipe the launcher's existing install engine understands.
          installConfig: edition.installConfig,
          installAction: resolveInstallAction(edition),

          requirements: edition.requirements ?? game.systemRequirements ?? null,
          links: edition.links,
        });
      }
    }

    return NextResponse.json({ count: entries.length, editions: entries });
  } catch (err) {
    console.error("Launcher editions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
