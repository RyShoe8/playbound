import { cache } from "react";
import { instanceMemo } from "@/lib/instanceMemo";
import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import type { Game, InstallStep } from "@/lib/data/types";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import type { LauncherInstall } from "@/lib/launcherInstall";
import { editions as seedEditions, type EditionSeed } from "@/lib/data/editions";
import {
  compareEditions,
  isReachable,
  type Edition,
  type EditionInstallConfig,
  type EditionStatus,
  type EditionType,
  type EditionVisibility,
  type InstallMethod,
  type VerificationLevel,
} from "@/lib/editionTypes";
import { supportsController } from "@/lib/controller/support";

export type { Edition };
export { editionTelemetryProps, hasChoosableEditions } from "@/lib/editionTypes";

type LeanEdition = Record<string, unknown>;

function seedToEdition(seed: EditionSeed): Edition {
  return {
    id: `seed:${seed.gameSlug}:${seed.slug}`,
    gameSlug: seed.gameSlug,
    slug: seed.slug,
    name: seed.name,
    shortDescription: seed.shortDescription,
    description: seed.description,
    type: seed.type ?? "community",
    status: seed.status ?? "active",
    visibility: seed.visibility ?? "public",
    sortOrder: seed.sortOrder ?? 10,
    isDefault: Boolean(seed.isDefault),
    isStandalone: Boolean(seed.isStandalone),
    branding: {
      logo: seed.branding?.logo ?? undefined,
      heroImage: seed.branding?.heroImage ?? undefined,
      screenshots: seed.branding?.screenshots ?? [],
      videos: seed.branding?.videos ?? [],
    },
    links: {
      website: seed.links?.website ?? undefined,
      discord: seed.links?.discord ?? undefined,
      wiki: seed.links?.wiki ?? undefined,
      github: seed.links?.github ?? undefined,
      forum: seed.links?.forum ?? undefined,
    },
    installMethod: seed.installMethod,
    installConfig: seed.installConfig ?? {},
    requirements: seed.requirements,
    hardwareRequirements: seed.hardwareRequirements,
    platforms: seed.platforms,
    features: seed.features ?? [],
    tags: seed.tags ?? [],
    hasControllerSupport: seed.hasControllerSupport,
    hasFlightstickSupport: seed.hasFlightstickSupport,
    aliases: seed.aliases ?? [],
    serverName: seed.serverName ?? undefined,
    languages: seed.languages ?? [],
    developerSlug: seed.developerSlug ?? undefined,
    developerName: seed.developerName ?? undefined,
    credits: seed.credits ?? [],
    license: seed.license ?? undefined,
    releaseYear: seed.releaseYear ?? undefined,
    longDescription: seed.longDescription ?? undefined,
    whyWePickedIt: seed.whyWePickedIt ?? undefined,
    bestFor: seed.bestFor ?? [],
    notFor: seed.notFor ?? [],
    version: seed.version ?? undefined,
    firstPlaySteps: seed.firstPlaySteps ?? [],
    multiplayerGamingSteps: seed.multiplayerGamingSteps ?? [],
    faq: seed.faq ?? [],
    patchNotes: [],
    verified: seed.verificationLevel === "official" || seed.verificationLevel === "playbound_verified",
    verificationLevel: seed.verificationLevel ?? "untested",
    verificationNote: seed.verificationNote ?? undefined,
    population: null,
    virtual: false,
  };
}

/**
 * This module deliberately never imports from "@/lib/catalog".
 *
 * Catalog needs editions (search, game pages) and editions need game data to
 * synthesize virtual defaults, which would be a require cycle. Instead, every
 * function that needs a game takes the Game object as an argument — the caller
 * already has it.
 */

const VIRTUAL_PREFIX = "virtual:";

/**
 * Percent-decode a route id, tolerating ids that were never encoded.
 *
 * decodeURIComponent throws on a stray "%", which a hand-edited URL can carry,
 * and that must not become a 500 — an id we cannot decode is simply an id that
 * will not match anything.
 */
function decodeEditionId(id: string): string {
  if (!id) return "";
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/** Seed-backed id, e.g. "seed:holocure:playbound". Accepts encoded ids. */
export function parseSeedEditionId(
  id: string
): { gameSlug: string; slug: string } | null {
  const decoded = decodeEditionId(id);
  if (!decoded.startsWith("seed:")) return null;
  const [, gameSlug, slug] = decoded.split(":");
  return gameSlug && slug ? { gameSlug, slug } : null;
}

export function isVirtualId(id: string): boolean {
  return decodeEditionId(id).startsWith(VIRTUAL_PREFIX);
}

function str(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

export function toEdition(doc: LeanEdition): Edition {
  const branding = (doc.branding as Record<string, unknown>) ?? {};
  const links = (doc.links as Record<string, unknown>) ?? {};
  const requirements = doc.requirements as Record<string, unknown> | null;

    let installMethod = (doc.installMethod as InstallMethod) ?? "manual";
    let installConfig = (doc.installConfig as EditionInstallConfig) ?? {};

    // If a legacy database record contains a dead/broken upstream URL (e.g. sahaquiel.us),
    // override with the latest curated seed edition config so launcher installs don't fail.
    const gameSlugStr = str(doc.gameSlug);
    const editionSlugStr = str(doc.slug);
    const seedMatch = seedEditions.find(
      (s) => s.gameSlug === gameSlugStr && s.slug === editionSlugStr
    );
    // Freedoom's engine choice is functional, not cosmetic: GZDoom is the
    // singleplayer build while Zandronum is the party-compatible build. Keep
    // old Mongo rows from overriding those curated labels/capabilities and
    // causing party clients to present the wrong installer.
    const useCuratedFreedoomMetadata = gameSlugStr === "freedoom" && Boolean(seedMatch);
    if (
      seedMatch &&
      (JSON.stringify(installConfig).includes("sahaquiel.us") ||
        (gameSlugStr === "everquest" && editionSlugStr === "project-quarm") ||
        (gameSlugStr === "wolfenstein-enemy-territory" &&
          editionSlugStr === "et-legacy" &&
          (installConfig.playbound_installer?.kind === "external" ||
            installConfig.playbound_installer?.kind === "github-zip" ||
            !installConfig.playbound_installer?.overlayDest ||
            !installConfig.playbound_installer?.unwrapSingleRoot)) ||
        (gameSlugStr === "tes-arena" &&
          (editionSlugStr === "official" || editionSlugStr === "opentesarena")) ||
        // Daggerfall Unity is curated in the database now; only Classic stays pinned to the seed.
        (gameSlugStr === "daggerfall" && editionSlugStr === "classic-dos") ||
        (gameSlugStr === "privateer-gemini-gold" && editionSlugStr === "gemini-gold-1-03") ||
        (gameSlugStr === "holocure" &&
          (editionSlugStr === "playbound" || editionSlugStr === "official")) ||
        (gameSlugStr === "castlevania-revamped" &&
          (editionSlugStr === "official" || JSON.stringify(installConfig).includes("archive/refs/heads/main.zip"))))
    ) {
      installConfig = seedMatch.installConfig ?? installConfig;
      installMethod = seedMatch.installMethod ?? installMethod;
    }

    if (seedMatch?.installConfig?.playbound_installer && installConfig.playbound_installer) {
      if (!installConfig.playbound_installer.urlMac && seedMatch.installConfig.playbound_installer.urlMac) {
        installConfig.playbound_installer.urlMac = seedMatch.installConfig.playbound_installer.urlMac;
      }
      if (!installConfig.playbound_installer.urlLinux && seedMatch.installConfig.playbound_installer.urlLinux) {
        installConfig.playbound_installer.urlLinux = seedMatch.installConfig.playbound_installer.urlLinux;
      }
    }

    /*
     * A stored edition that is really a separate storefront product.
     *
     * Alien Swarm: Reactive Drop is a community edition of alien-swarm here,
     * but on Steam it is its own app (563560, not the parent's 630). Its row
     * carries no install recipe of its own, so the launcher fell back to the
     * parent game's external hand-off and opened Steam on Alien Swarm — the
     * edition the player chose never installed.
     *
     * launcherInstall.ts already keys a recipe by the edition slug for exactly
     * this case. It was unreachable because deriveInstallMethod only ever looks
     * up launcherInstallBySlug[game.slug], and no game has that slug. Consult it
     * by edition slug here, and only when the edition has nothing actionable of
     * its own, so a real stored recipe always wins.
     */
    const hasOwnInstall = Boolean(
      installConfig.playbound_installer?.kind ||
        installConfig.official_download?.url ||
        installConfig.external_installer?.url
    );
    const editionRecipe = launcherInstallBySlug[editionSlugStr];
    /*
     * A stored Steam hand-off (external_installer / steam) only says where to
     * install from. The launcher needs the edition's own app id and executable
     * names to recognise the finished install; without them it fell back to the
     * parent game's, so Alien Swarm: Reactive Drop kept reading "not installed".
     * Add them whenever the edition has no richer recipe of its own.
     */
    const needsDetectionFields = Boolean(
      editionRecipe?.enabled &&
        editionRecipe.kind === "external" &&
        !installConfig.playbound_installer?.kind &&
        !installConfig.official_download?.url
    );
    if ((!hasOwnInstall || needsDetectionFields) && editionRecipe?.enabled && editionRecipe.url) {
      if (editionRecipe.kind === "external") {
        /*
         * A bare hand-off URL is not enough. Without the edition's Steam app id
         * and executable names the launcher fell back to the parent game's
         * (Alien Swarm's swarm.exe), so Reactive Drop installed fine and then
         * "didn't find the .exe". Carry the detection fields with it.
         */
        installMethod = "playbound_installer";
        installConfig = {
          ...installConfig,
          playbound_installer: {
            kind: "external",
            url: installConfig.external_installer?.url || editionRecipe.url,
            steamAppId: editionRecipe.steamAppId ?? null,
            exeHint: editionRecipe.exeHint ?? null,
            knownExePaths: editionRecipe.knownExePaths ?? [],
            connectArgs: editionRecipe.connectArgs ?? [],
            note: editionRecipe.note ?? null,
          },
        };
      } else {
        installMethod = "external_installer";
        installConfig = {
          ...installConfig,
          external_installer: { url: editionRecipe.url, instructions: editionRecipe.note ?? undefined },
        };
      }
    }

    return {
      id: String(doc._id),
      gameId: doc.gameId ? String(doc.gameId) : undefined,
      gameSlug: gameSlugStr,
      slug: editionSlugStr,
      name: useCuratedFreedoomMetadata ? seedMatch!.name : str(doc.name),
      shortDescription: useCuratedFreedoomMetadata
        ? seedMatch!.shortDescription
        : str(doc.shortDescription),
      description: str(doc.description),

      type: useCuratedFreedoomMetadata
        ? seedMatch!.type ?? "community"
        : (doc.type as EditionType) ?? "community",
      status: (doc.status as EditionStatus) ?? "active",
      visibility: (doc.visibility as EditionVisibility) ?? "public",

      sortOrder: useCuratedFreedoomMetadata ? seedMatch!.sortOrder ?? 0 : Number(doc.sortOrder) || 0,
      isDefault: useCuratedFreedoomMetadata ? Boolean(seedMatch!.isDefault) : Boolean(doc.isDefault),
      isStandalone:
        doc.isStandalone !== undefined
          ? Boolean(doc.isStandalone)
          : Boolean(seedMatch?.isStandalone),

      branding: {
        logo: (branding.logo as string) || undefined,
        heroImage: (branding.heroImage as string) || undefined,
        screenshots: (branding.screenshots as string[]) ?? [],
        videos: (branding.videos as string[]) ?? [],
        artHue: branding.artHue == null ? undefined : Number(branding.artHue),
      },
      links: {
        website: (links.website as string) || seedMatch?.links?.website || undefined,
        discord: (links.discord as string) || seedMatch?.links?.discord || undefined,
        wiki: (links.wiki as string) || seedMatch?.links?.wiki || undefined,
        github: (links.github as string) || seedMatch?.links?.github || undefined,
        forum: (links.forum as string) || seedMatch?.links?.forum || undefined,
      },

      installMethod,
      installConfig,

    requirements: requirements
      ? {
          min: (requirements.min as string) || undefined,
          recommended: (requirements.recommended as string) || undefined,
          notes: (requirements.notes as string) || undefined,
        }
      : undefined,
    hardwareRequirements: (doc.hardwareRequirements as Edition["hardwareRequirements"]) || null,
    platforms:
      gameSlugStr === "privateer-gemini-gold" && editionSlugStr === "gemini-gold-1-03"
        ? seedMatch?.platforms
        : Array.isArray(doc.platforms) && doc.platforms.length > 0
        ? (doc.platforms as string[])
        : seedMatch?.platforms,
    features: useCuratedFreedoomMetadata ? seedMatch!.features ?? [] : (doc.features as string[]) ?? [],
    tags: useCuratedFreedoomMetadata ? seedMatch!.tags ?? [] : (doc.tags as string[]) ?? [],
    hasControllerSupport: doc.hasControllerSupport == null ? seedMatch?.hasControllerSupport : Boolean(doc.hasControllerSupport),
    hasFlightstickSupport: doc.hasFlightstickSupport == null ? seedMatch?.hasFlightstickSupport : Boolean(doc.hasFlightstickSupport),
    aliases: useCuratedFreedoomMetadata ? seedMatch!.aliases ?? [] : (doc.aliases as string[]) ?? [],
    serverName: (doc.serverName as string) || undefined,
    languages: (doc.languages as string[]) ?? [],
    developerSlug: (doc.developerSlug as string) || seedMatch?.developerSlug || undefined,
    developerName: (doc.developerName as string) || seedMatch?.developerName || undefined,
    credits:
      Array.isArray(doc.credits) && doc.credits.length > 0
        ? (doc.credits as Edition["credits"])
        : seedMatch?.credits ?? [],
    license: (doc.license as string) || seedMatch?.license || undefined,
    releaseYear: doc.releaseYear == null ? seedMatch?.releaseYear ?? undefined : Number(doc.releaseYear),
    longDescription: (doc.longDescription as string) || seedMatch?.longDescription || undefined,
    whyWePickedIt: (doc.whyWePickedIt as string) || seedMatch?.whyWePickedIt || undefined,
    bestFor: Array.isArray(doc.bestFor) && doc.bestFor.length > 0 ? (doc.bestFor as string[]) : seedMatch?.bestFor ?? [],
    notFor: Array.isArray(doc.notFor) && doc.notFor.length > 0 ? (doc.notFor as string[]) : seedMatch?.notFor ?? [],

    version: (doc.version as string) || undefined,
    firstPlaySteps:
      Array.isArray(doc.firstPlaySteps) && doc.firstPlaySteps.length > 0
        ? (doc.firstPlaySteps as InstallStep[])
        : seedMatch?.firstPlaySteps ?? [],
    multiplayerGamingSteps:
      Array.isArray(doc.multiplayerGamingSteps) && doc.multiplayerGamingSteps.length > 0
        ? (doc.multiplayerGamingSteps as InstallStep[])
        : seedMatch?.multiplayerGamingSteps ?? [],
    patchNotes: (doc.patchNotes as Edition["patchNotes"]) ?? [],
    faq: (doc.faq as Edition["faq"]) ?? [],

    verified: Boolean(doc.verified),
    verificationLevel: (doc.verificationLevel as VerificationLevel) ?? "untested",
    verifiedAt: doc.verifiedAt ? new Date(doc.verifiedAt as Date).toISOString() : undefined,
    verifiedBy: (doc.verifiedBy as string) || undefined,
    verificationNote: (doc.verificationNote as string) || undefined,

    population: doc.population == null ? null : Number(doc.population),

    virtual: false,

    createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as Date).toISOString() : undefined,
  };
}

/**
 * Derive the InstallMethod + installConfig for an Official virtual edition
 * from the parent Game's catalog fields.
 *
 * Ordered by how much PlayBound can do for the reader: a one-click launcher
 * install beats a browser tab, which beats sending them to a storefront, which
 * beats written instructions.
 */
function deriveInstallMethod(game: Game): { method: InstallMethod; config: EditionInstallConfig } {
  const recipe =
    (game.launcherInstall as LauncherInstall | undefined) ||
    launcherInstallBySlug[game.slug] ||
    null;
  /*
   * An external recipe is still an install, just one another storefront
   * performs. It was falling through every branch below, so a game whose only
   * recipe is external (Alien Swarm -> steam://install/630) produced an
   * Official edition pointing at its marketing site instead of the store, and
   * the launcher could not act on it at all.
   */
  if (recipe?.enabled && recipe.kind === "external" && recipe.url) {
    return {
      method: "external_installer",
      config: { external_installer: { url: recipe.url, instructions: recipe.note ?? undefined } },
    };
  }
  if (recipe?.enabled && recipe.kind && recipe.kind !== "external") {
    return {
      method: "playbound_installer",
      config: {
        playbound_installer: {
          kind: recipe.kind,
          repo: recipe.repo ?? null,
          assetPattern: recipe.assetPattern ?? null,
          exeHint: recipe.exeHint ?? null,
          url: recipe.url ?? null,
          // Same per-platform fields the game entry carries, or an edition
          // derived from a game would only ever install on Windows.
          urlMac: recipe.urlMac ?? null,
          urlMacX64: recipe.urlMacX64 ?? null,
          urlLinux: recipe.urlLinux ?? null,
          assetPatternMac: recipe.assetPatternMac ?? null,
          assetPatternLinux: recipe.assetPatternLinux ?? null,
          fileName: recipe.fileName ?? null,
          versionLabel: recipe.versionLabel ?? null,
          knownExePaths: recipe.knownExePaths ?? [],
          installRoot: recipe.installRoot ?? null,
          connectArgs: recipe.connectArgs ?? [],
          note: recipe.note ?? null,
          overlayUrl: recipe.overlayUrl ?? null,
          overlayFileName: recipe.overlayFileName ?? null,
          overlayDest: recipe.overlayDest ?? null,
          unwrapSingleRoot: recipe.unwrapSingleRoot || undefined,
          needsDosBox: recipe.needsDosBox || undefined,
          // Carried through, or an edition derived from a game's recipe would
          // silently lose the flag and install unelevated.
          needsAdmin: recipe.needsAdmin || undefined,
          requiresBaseDir: recipe.requiresBaseDir || undefined,
          baseExeHint: recipe.baseExeHint || undefined,
        },
      },
    };
  }
  if (game.browserPlayable) {
    return { method: "browser", config: { browser: { playUrl: game.website } } };
  }
  if (game.steamAppId) {
    return { method: "steam", config: { steam: { appId: game.steamAppId } } };
  }
  if (game.androidStoreUrl || game.iosStoreUrl) {
    return {
      method: "mobile_store",
      config: {
        mobile_store: {
          androidUrl: game.androidStoreUrl || undefined,
          iosUrl: game.iosStoreUrl || undefined,
        },
      },
    };
  }
  if (game.installSteps?.length) {
    return {
      method: "manual",
      config: {
        manual: {
          steps: game.installSteps.map((s) => ({
            platform: s.platform,
            text: s.text,
            command: s.command ?? null,
          })),
        },
      },
    };
  }
  return { method: "official_download", config: { official_download: { url: game.website } } };
}

/**
 * Synthesize the Official edition for a game that has none stored.
 *
 * This is what keeps every existing game working unchanged: callers can assume
 * a game always has at least one edition, so the launcher, the game page and
 * the API never need a "game without editions" branch. It is not persisted —
 * `virtual: true` and an id of `virtual:<slug>` mark it so nothing tries to
 * edit or delete something that does not exist.
 */
export function deriveVirtualEdition(game: Game): Edition {
  const { method, config } = deriveInstallMethod(game);
  return {
    id: `${VIRTUAL_PREFIX}${game.slug}`,
    gameSlug: game.slug,
    slug: "official",
    name: "Official",
    shortDescription: game.tagline,
    description: game.longDescription || game.description,

    type: "official",
    status: "active",
    visibility: "public",

    sortOrder: 0,
    isDefault: true,

    branding: {
      heroImage: game.coverImage,
      screenshots: game.screenshots ?? [],
      videos: game.videos ?? [],
    },
    links: {
      website: game.website,
      discord: game.communityLinks?.officialDiscord?.inviteUrl,
      github: game.githubRepo ? `https://github.com/${game.githubRepo}` : undefined,
    },

    installMethod: method,
    installConfig: config,

    requirements: game.systemRequirements
      ? { min: game.systemRequirements.min, recommended: game.systemRequirements.recommended }
      : undefined,
    platforms: game.platforms,
    features: game.features ?? [],
    tags: game.tags ?? [],
    hasControllerSupport: game.hasControllerSupport,
    hasFlightstickSupport: game.hasFlightstickSupport,
    aliases: game.aliases ?? [],
    languages: [],

    patchNotes: [],
    faq: game.faq ?? [],

    // The game itself is the developers' own release, so the virtual edition
    // inherits official standing rather than appearing untested.
    verified: true,
    verificationLevel: "official",

    population: null,
    virtual: true,
  };
}

/** Editions removed from seed but possibly still stored in Mongo. */
function filterRetiredEditions(gameSlug: string, editions: Edition[]): Edition[] {
  if (
    gameSlug === "super-sidekicks" ||
    gameSlug === "baseball-stars-2" ||
    gameSlug === "soccer-brawl"
  ) {
    return editions.filter((e) => e.slug !== "official");
  }
  if (gameSlug === "wipeout-rewrite") {
    return editions.filter((e) => e.slug !== "phantom-edition");
  }
  if (gameSlug === "privateer-gemini-gold") {
    // The old Unix row represented an operating-system package, not a distinct
    // edition. The unified 1.03 recipe now selects that package itself.
    return editions.filter((e) => e.slug !== "gemini-gold-unix");
  }
  if (gameSlug === "wolfenstein-enemy-territory") {
    // Steam edition is archived and unlisted. Suppress from public/launcher catalogs.
    return editions.filter(
      (e) => e.slug !== "steam" || (e.status === "active" && e.visibility === "public")
    );
  }
  if (gameSlug === "openra") {
    /*
     * OpenE2140 belongs on earth-2140-trilogy. A Mongo/admin row that nested
     * it under openra made parties force Game.Mod=ra onto OpenE2140.exe.
     */
    return editions.filter(
      (e) => e.slug !== "opene2140" && !/e2140|earth.?2140/i.test(String(e.slug || ""))
    );
  }
  return editions;
}

/**
 * Merge database editions with static seeds while honoring deletion
 * tombstones. `occupiedSeedSlugs` includes ordinary stored rows and hidden
 * suppressesSeed rows, because either one must prevent the same seed slug from
 * being materialized again.
 */
export function mergeStoredAndSeedEditions(
  gameSlug: string,
  stored: Edition[],
  occupiedSeedSlugs: ReadonlySet<string>
): Edition[] {
  const seeds = seedEditions
    .filter((seed) => seed.gameSlug === gameSlug && !occupiedSeedSlugs.has(seed.slug))
    .map(seedToEdition);
  return filterRetiredEditions(gameSlug, [...stored, ...seeds]);
}

async function fetchEditions(filter: Record<string, unknown>): Promise<Edition[]> {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri === "[SENSITIVE]" || (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://"))) {
    return [];
  }
  try {
    await dbConnect();
    const docs = await EditionModel.find({
      ...filter,
      suppressesSeed: { $ne: true },
    }).sort({ sortOrder: 1, name: 1 }).lean();
    return docs.map((d) => toEdition(d as LeanEdition));
  } catch (err) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return [];
    }
    throw err;
  }
}

/**
 * Every stored edition, grouped by game, read once and shared.
 *
 * Game pages used to run a Mongo query for their own editions on every
 * request. That kept each of them off the cache and, on a cold serverless
 * instance, put a database connection on the path of every page view — about
 * 1.5 seconds of tail latency on a page whose shell is ready in 250ms. One
 * snapshot serves every game page, and a crawler walking the catalog warms it
 * for all of them instead of paying a query per slug.
 *
 * A short window plus the "editions" tag: the admin edition routes drop it
 * immediately, and writers that do not (the version cron, the launcher-package
 * route) show up within the window.
 */
type StoredEditionState = { editions: Edition[]; occupiedSeedSlugs: string[] };

async function readStoredEditionSnapshot(): Promise<Record<string, StoredEditionState>> {
  await dbConnect();
  const docs = await EditionModel.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const out: Record<string, StoredEditionState> = {};
  for (const doc of docs) {
    const lean = doc as LeanEdition;
    const slug = str(lean.gameSlug);
    const bucket = (out[slug] ||= { editions: [], occupiedSeedSlugs: [] });
    bucket.occupiedSeedSlugs.push(str(lean.slug));
    if (lean.suppressesSeed !== true) bucket.editions.push(toEdition(lean));
  }
  return out;
}

function loadStoredEditionSnapshot(): Promise<Record<string, StoredEditionState>> {
  return instanceMemo("stored-editions-snapshot", 20_000, () => unstable_cache(readStoredEditionSnapshot, ["stored-editions-snapshot"], {
    revalidate: 120,
    tags: ["editions"],
  })());
}

/** Stored editions plus seed slugs deliberately deleted through admin. */
async function fetchEditionStateForGame(
  gameSlug: string
): Promise<{ editions: Edition[]; occupiedSeedSlugs: Set<string> }> {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri === "[SENSITIVE]" || (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://"))) {
    return { editions: [], occupiedSeedSlugs: new Set() };
  }
  try {
    const bucket = (await loadStoredEditionSnapshot())[gameSlug];
    return {
      editions: bucket?.editions ?? [],
      occupiedSeedSlugs: new Set(bucket?.occupiedSeedSlugs ?? []),
    };
  } catch (err) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return { editions: [], occupiedSeedSlugs: new Set() };
    }
    throw err;
  }
}

/**
 * Stored editions for one game, newest read memoized per request.
 * Returns [] when none exist — callers decide whether to synthesize.
 */
const loadStoredForGame = cache(async (gameSlug: string): Promise<Edition[]> => {
  try {
    const { editions: fromDb, occupiedSeedSlugs } = await fetchEditionStateForGame(gameSlug);
    return mergeStoredAndSeedEditions(gameSlug, fromDb, occupiedSeedSlugs);
  } catch (err) {
    console.error("[editions] read failed:", err);
    const seeds = seedEditions.filter((s) => s.gameSlug === gameSlug);
    return filterRetiredEditions(gameSlug, seeds.map(seedToEdition));
  }
});

export interface EditionQuery {
  /** Include hidden editions (admin surfaces). */
  includeHidden?: boolean;
  /** Include archived/deprecated ones. Default true — they stay browsable. */
  includeInactive?: boolean;
}

/**
 * Every edition for a game, in display order, always non-empty.
 *
 * Falls back to the synthesized Official edition when nothing is stored, which
 * is what makes this safe to call for any game in the catalog including static
 * seed games that have no database row at all.
 */
/**
 * Can this game be installed on its own, independent of any edition?
 *
 * Only a real recipe counts. `deriveInstallMethod` always returns something —
 * it falls back to `official_download` pointing at the game's website — and
 * treating that fallback as installable would list an Official edition whose
 * only action is "visit the homepage" beside a working community edition.
 */
function gameInstallsOnItsOwn(game: Game): boolean {
  const recipe = (game.launcherInstall as LauncherInstall | undefined) || launcherInstallBySlug[game.slug];
  if (recipe?.enabled && recipe.kind) return true;
  return Boolean(game.browserPlayable || game.steamAppId || game.installSteps?.length);
}

/**
 * Does any stored edition already stand for the base game?
 *
 * An edition named `official`, or typed `official`, is the base game's own
 * row. Community editions are additions to it, never replacements.
 */
function storedCoversBaseGame(stored: Edition[]): boolean {
  return stored.some((e) => e.slug === "official" || e.type === "official");
}

export function listedEditionsFromStored(
  game: Game,
  stored: Edition[],
  opts: EditionQuery = {}
): Edition[] {
  if (stored.length === 0) {
    return [deriveVirtualEdition(game)];
  }

  let visible = opts.includeHidden ? stored : stored.filter(isReachable);
  if (opts.includeInactive === false) {
    visible = visible.filter((e) => e.status === "active" || e.status === "coming_soon");
  }

  // Everything stored could be hidden from this viewer; never return nothing.
  if (visible.length === 0) {
    return opts.includeHidden ? stored : [deriveVirtualEdition(game)];
  }

  /*
   * The base game is not an edition, and adding a row for it would be one more
   * edition to curate. But a game with any stored edition used to list only
   * those, so the base game silently became unplayable the moment a community
   * edition was added: Alien Swarm's single Reactive Drop edition (Steam app
   * 563560) hid Alien Swarm itself (app 630) entirely.
   *
   * Synthesize the Official edition instead of storing one, and only when the
   * game genuinely installs on its own — `deriveInstallMethod` resolving to a
   * real recipe. A game that is only playable through a community edition
   * (no recipe of its own) still lists just that edition, so this does not
   * invent a base game where none exists.
   */
  if (!storedCoversBaseGame(visible) && gameInstallsOnItsOwn(game)) {
    const base = deriveVirtualEdition(game);
    // A stored edition that is already the default keeps that role; otherwise
    // the base game is the obvious default.
    const storedDefault = visible.some((e) => e.isDefault);
    visible = [{ ...base, isDefault: !storedDefault, sortOrder: -1 }, ...visible];
  }

  const sorted = [...visible].sort(compareEditions);
  // Guarantee exactly one default so the UI always has something to highlight.
  if (!sorted.some((e) => e.isDefault) && sorted[0]) {
    sorted[0] = { ...sorted[0], isDefault: true };
  }
  return sorted;
}

export async function listEditionsForGame(
  game: Game,
  opts: EditionQuery = {}
): Promise<Edition[]> {
  const stored = await loadStoredForGame(game.slug);
  return listedEditionsFromStored(game, stored, opts);
}

async function fetchEditionStateForGames(
  gameSlugs: string[]
): Promise<Map<string, { editions: Edition[]; occupiedSeedSlugs: Set<string> }>> {
  const bySlug = new Map<string, { editions: Edition[]; occupiedSeedSlugs: Set<string> }>();
  for (const slug of gameSlugs) {
    bySlug.set(slug, { editions: [], occupiedSeedSlugs: new Set() });
  }
  const uri = process.env.MONGODB_URI;
  if (gameSlugs.length === 0 || !uri || uri === "[SENSITIVE]" || (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://"))) {
    return bySlug;
  }
  try {
    const snapshot = await loadStoredEditionSnapshot();
    for (const slug of gameSlugs) {
      const stored = snapshot[slug];
      if (!stored) continue;
      bySlug.set(slug, {
        editions: [...stored.editions],
        occupiedSeedSlugs: new Set(stored.occupiedSeedSlugs),
      });
    }
  } catch (err) {
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      throw err;
    }
  }
  return bySlug;
}

/**
 * One Mongo query for every game's editions, then the same merge/filter as
 * `listEditionsForGame`. The launcher catalog used to call that helper once
 * per game and fan out hundreds of identical finds.
 */
export async function listEditionsForGames(
  games: Game[],
  opts: EditionQuery = {}
): Promise<Map<string, Edition[]>> {
  const result = new Map<string, Edition[]>();
  let stateBySlug: Map<string, { editions: Edition[]; occupiedSeedSlugs: Set<string> }>;
  try {
    stateBySlug = await fetchEditionStateForGames(games.map((game) => game.slug));
  } catch (err) {
    console.error("[editions] batch read failed:", err);
    for (const game of games) {
      const seeds = seedEditions.filter((s) => s.gameSlug === game.slug);
      result.set(
        game.slug,
        listedEditionsFromStored(
          game,
          filterRetiredEditions(game.slug, seeds.map(seedToEdition)),
          opts
        )
      );
    }
    return result;
  }

  for (const game of games) {
    const state = stateBySlug.get(game.slug) || {
      editions: [],
      occupiedSeedSlugs: new Set<string>(),
    };
    const stored = mergeStoredAndSeedEditions(game.slug, state.editions, state.occupiedSeedSlugs);
    result.set(game.slug, listedEditionsFromStored(game, stored, opts));
  }
  return result;
}

/** Public, stored edition chips without materializing every full game record. */
export async function listStoredPublicEditionChips(
  gameSlugs: readonly string[]
): Promise<Map<string, Array<[slug: string, name: string]>>> {
  const stateBySlug = await fetchEditionStateForGames([...gameSlugs]);
  const chips = new Map<string, Array<[slug: string, name: string]>>();
  for (const gameSlug of gameSlugs) {
    const state = stateBySlug.get(gameSlug);
    const editions = mergeStoredAndSeedEditions(
      gameSlug,
      state?.editions ?? [],
      state?.occupiedSeedSlugs ?? new Set<string>()
    )
      .filter((edition) => edition.visibility === "public" && edition.status !== "archived")
      .sort(compareEditions);
    if (editions.length === 0) continue;
    if (editions.length === 1 &&
        (editions[0].slug === "official" || editions[0].slug === "default") &&
        editions[0].type === "official") continue;
    chips.set(gameSlug, editions.map((edition) => [edition.slug, edition.name]));
  }
  return chips;
}

/** Editions shown in listings — public visibility only. */
export async function listPublicEditionsForGame(game: Game): Promise<Edition[]> {
  const all = await listEditionsForGame(game);
  const publicOnly = all.filter((e) => e.visibility === "public");
  return publicOnly.length > 0 ? publicOnly : all.slice(0, 1);
}

/** One edition by its slug within a game. Hidden ones resolve by direct URL. */
export async function getEditionBySlug(
  game: Game,
  editionSlug: string,
  opts: EditionQuery = {}
): Promise<Edition | undefined> {
  const editions = await listEditionsForGame(game, { includeHidden: true, ...opts });
  const found = editions.find((e) => e.slug === editionSlug);
  if (!found) return undefined;
  if (!opts.includeHidden && found.visibility === "hidden") return undefined;
  return found;
}

/** One edition by database id. Never resolves virtual ids — they do not exist. */
export async function getEditionById(rawId: string): Promise<Edition | undefined> {
  /*
   * Seed and virtual ids carry colons ("seed:holocure:playbound"). A colon is
   * legal in a path segment but routinely arrives percent-encoded, and
   * "seed%3A…" fails the prefix test — so the id fell through to findById,
   * which cannot cast it, and the admin edit page 404'd on every seed-backed
   * edition. Decoding first makes both spellings resolve.
   */
  const id = decodeEditionId(rawId);
  if (!id || isVirtualId(id)) return undefined;
  if (id.startsWith("seed:")) {
    const parts = id.split(":");
    const gSlug = parts[1];
    const eSlug = parts[2];
    try {
      await dbConnect();
      const suppressed = await EditionModel.exists({
        gameSlug: gSlug,
        slug: eSlug,
        suppressesSeed: true,
      });
      if (suppressed) return undefined;
    } catch (err) {
      console.error("[editions] seed suppression lookup failed:", err);
    }
    const s = seedEditions.find((x) => x.gameSlug === gSlug && x.slug === eSlug);
    return s ? seedToEdition(s) : undefined;
  }
  try {
    await dbConnect();
    const doc = await EditionModel.findById(id).lean();
    return doc ? toEdition(doc as LeanEdition) : undefined;
  } catch (err) {
    console.error("[editions] getEditionById failed:", err);
    return undefined;
  }
}

/** All stored editions for a game including hidden — admin list. */
export async function listAllEditionsForGame(gameSlug: string): Promise<Edition[]> {
  try {
    const { editions: stored, occupiedSeedSlugs } = await fetchEditionStateForGame(gameSlug);
    /*
     * Merge exactly as loadStoredForGame does, rather than returning only the
     * stored rows when any exist.
     *
     * Those two disagreeing meant admin could not show an edition the launcher
     * was serving: one database row for a game hid every seed-only edition of
     * it, so a live install route was invisible to the person responsible for
     * it — unlistable, unopenable, uneditable. Stored still wins per slug.
     */
    return mergeStoredAndSeedEditions(gameSlug, stored, occupiedSeedSlugs).sort(compareEditions);
  } catch (err) {
    console.error("[editions] listAll failed:", err);
    const seeds = seedEditions.filter((s) => s.gameSlug === gameSlug).map(seedToEdition);
    return filterRetiredEditions(gameSlug, seeds).sort(compareEditions);
  }
}

/**
 * Where an edition is stored — the answer to "is this one seed-only?".
 *
 * Seed ids carry a "seed:" prefix, so this is derivable from the id alone and
 * needs no extra query. A seed-backed edition is served from the file and has
 * no database row until someone saves it.
 */
export function editionSource(id: string): "seed" | "database" {
  return parseSeedEditionId(id) ? "seed" : "database";
}

/** `game:slug` of every stored edition row, including tombstones and non-public copies. */
async function occupiedSeedKeys(): Promise<Set<string>> {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri === "[SENSITIVE]" || (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://"))) {
    return new Set();
  }
  await dbConnect();
  const docs = await EditionModel.find({}).select("gameSlug slug").lean();
  return new Set(docs.map((d) => `${str((d as LeanEdition).gameSlug)}:${str((d as LeanEdition).slug)}`));
}

/**
 * Every public, stored edition across the catalog — for the sitemap.
 *
 * Only real editions are returned: a virtual Official edition has no page of
 * its own worth indexing separately from the game it was derived from, and
 * unlisted/hidden ones must never appear in a sitemap.
 */
export async function listAllPublicEditions(): Promise<Edition[]> {
  try {
    const fromDb = await fetchEditions({ visibility: "public", status: { $ne: "archived" } });
    /*
     * Every stored row for a seed slug occupies it: a hidden or archived copy,
     * and above all a tombstone left when admin deleted a seed edition. The
     * sitemap used to subtract only the public rows, so seed editions that had
     * since been deleted or hidden were still advertised and answered 404.
     */
    const occupied = await occupiedSeedKeys();
    const seeds = seedEditions
      .filter(
        (s) =>
          (s.visibility ?? "public") === "public" &&
          s.status !== "archived" &&
          !occupied.has(`${s.gameSlug}:${s.slug}`)
      )
      .map(seedToEdition);
    const merged = [...fromDb, ...seeds];
    const gameSlugs = [...new Set(merged.map((e) => e.gameSlug))];
    return gameSlugs.flatMap((gameSlug) =>
      filterRetiredEditions(
        gameSlug,
        merged.filter((e) => e.gameSlug === gameSlug)
      )
    );
  } catch (err) {
    console.error("[editions] listAllPublic failed:", err);
    return seedEditions
      .filter((s) => (s.visibility ?? "public") === "public" && s.status !== "archived")
      .map(seedToEdition);
  }
}

export async function listAllEditions(includeHidden = true): Promise<Edition[]> {
  try {
    const filter = includeHidden ? {} : { visibility: { $ne: "hidden" } };
    const fromDb = await fetchEditions(filter);
    const dbKeys = new Set(fromDb.map((e) => `${e.gameSlug}:${e.slug}`));
    const seeds = seedEditions
      .filter((s) => !dbKeys.has(`${s.gameSlug}:${s.slug}`))
      .map(seedToEdition);
    return [...fromDb, ...seeds];
  } catch (err) {
    console.error("[editions] listAllEditions failed:", err);
    return seedEditions.map(seedToEdition);
  }
}

async function computeEditionCounts(): Promise<[string, number][]> {
  const counts = new Map<string, number>();
  for (const s of seedEditions) {
    counts.set(s.gameSlug, (counts.get(s.gameSlug) || 0) + 1);
  }
  try {
    await dbConnect();
    const rows = await EditionModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$gameSlug", count: { $sum: 1 } } },
    ]);
    for (const r of rows) {
      counts.set(r._id, r.count);
    }
  } catch (err) {
    console.error("[editions] counts failed:", err);
  }
  return Array.from(counts.entries());
}

/** How many editions each of the given games has stored, for admin lists. */
export async function editionCountsByGame(): Promise<Map<string, number>> {
  const entries = await unstable_cache(computeEditionCounts, ["admin-edition-counts"], {
    revalidate: 60,
    tags: ["editions"],
  })();
  return new Map(entries);
}

async function editionControllerSupportByGameUncached(): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  for (const s of seedEditions) {
    if (supportsController(s)) {
      map[s.gameSlug] = true;
    }
  }
  try {
    await dbConnect();
    const docs = await EditionModel.find({
      $or: [
        { features: { $regex: /controller|gamepad|flightstick|joystick|wheel|hotas/i } },
        { tags: { $regex: /controller|gamepad|flightstick|joystick|wheel|hotas/i } },
      ],
    })
      .select({ gameSlug: 1, features: 1, tags: 1 })
      .lean();

    for (const d of docs) {
      if (d.gameSlug && supportsController(d as unknown as Parameters<typeof supportsController>[0])) {
        map[d.gameSlug] = true;
      }
    }
  } catch (err) {
    console.error("[editions] controller support check failed:", err);
  }
  return map;
}

/**
 * Returns a map of gameSlug -> boolean for whether any of the game's editions
 * provide controller / gamepad / flightstick support.
 */
export async function editionControllerSupportByGame(): Promise<Record<string, boolean>> {
  return unstable_cache(editionControllerSupportByGameUncached, ["edition-controller-support"], {
    revalidate: 300,
    tags: ["editions"],
  })();
}

/**
 * Editions matching a text query, for site search.
 *
 * Searches name, short description and tags so "Turtle" surfaces Turtle WoW
 * even though the game is called World of Warcraft. Hidden editions never
 * appear. Independent of the catalog module, so search can join the results
 * to games itself without creating an import cycle.
 */
export async function searchEditions(query: string, limit = 20): Promise<Edition[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    await dbConnect();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");
    const docs = await EditionModel.find({
      suppressesSeed: { $ne: true },
      visibility: { $ne: "hidden" },
      $or: [
        { name: rx },
        { shortDescription: rx },
        { tags: rx },
        // "Turtle" and "TWoW" must both reach Turtle WoW, and a player who
        // knows a server only by its in-game name must find it too.
        { aliases: rx },
        { serverName: rx },
        { slug: rx },
      ],
    })
      .limit(limit)
      .lean();
    return docs.map((d) => toEdition(d as LeanEdition));
  } catch (err) {
    console.error("[editions] search failed:", err);
    return [];
  }
}
