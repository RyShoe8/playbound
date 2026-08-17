import { cache } from "react";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import type { Game } from "@/lib/data/types";
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
    features: seed.features ?? [],
    tags: seed.tags ?? [],
    aliases: seed.aliases ?? [],
    serverName: seed.serverName ?? undefined,
    languages: seed.languages ?? [],
    version: seed.version ?? undefined,
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
export function decodeEditionId(id: string): string {
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

function toEdition(doc: LeanEdition): Edition {
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
    if (
      seedMatch &&
      (JSON.stringify(installConfig).includes("sahaquiel.us") ||
        (gameSlugStr === "everquest" && editionSlugStr === "project-quarm"))
    ) {
      installConfig = seedMatch.installConfig ?? installConfig;
      installMethod = seedMatch.installMethod ?? installMethod;
    }

    return {
      id: String(doc._id),
      gameId: doc.gameId ? String(doc.gameId) : undefined,
      gameSlug: gameSlugStr,
      slug: editionSlugStr,
      name: str(doc.name),
      shortDescription: str(doc.shortDescription),
      description: str(doc.description),

      type: (doc.type as EditionType) ?? "community",
      status: (doc.status as EditionStatus) ?? "active",
      visibility: (doc.visibility as EditionVisibility) ?? "public",

      sortOrder: Number(doc.sortOrder) || 0,
      isDefault: Boolean(doc.isDefault),

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
    features: (doc.features as string[]) ?? [],
    tags: (doc.tags as string[]) ?? [],
    aliases: (doc.aliases as string[]) ?? [],
    serverName: (doc.serverName as string) || undefined,
    languages: (doc.languages as string[]) ?? [],

    version: (doc.version as string) || undefined,
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
          fileName: recipe.fileName ?? null,
          versionLabel: recipe.versionLabel ?? null,
          knownExePaths: recipe.knownExePaths ?? [],
          installRoot: recipe.installRoot ?? null,
          connectArgs: recipe.connectArgs ?? [],
          note: recipe.note ?? null,
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
    features: game.features ?? [],
    tags: game.tags ?? [],
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

async function fetchEditions(filter: Record<string, unknown>): Promise<Edition[]> {
  await dbConnect();
  const docs = await EditionModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  return docs.map((d) => toEdition(d as LeanEdition));
}

/**
 * Stored editions for one game, newest read memoized per request.
 * Returns [] when none exist — callers decide whether to synthesize.
 */
const loadStoredForGame = cache(async (gameSlug: string): Promise<Edition[]> => {
  try {
    const fromDb = await fetchEditions({ gameSlug });
    const dbSlugs = new Set(fromDb.map((e) => e.slug));
    const seeds = seedEditions
      .filter((s) => s.gameSlug === gameSlug && !dbSlugs.has(s.slug))
      .map(seedToEdition);
    return [...fromDb, ...seeds];
  } catch (err) {
    console.error("[editions] read failed:", err);
    const seeds = seedEditions.filter((s) => s.gameSlug === gameSlug);
    return seeds.map(seedToEdition);
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
export async function listEditionsForGame(
  game: Game,
  opts: EditionQuery = {}
): Promise<Edition[]> {
  const stored = await loadStoredForGame(game.slug);

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

  const sorted = [...visible].sort(compareEditions);
  // Guarantee exactly one default so the UI always has something to highlight.
  if (!sorted.some((e) => e.isDefault) && sorted[0]) {
    sorted[0] = { ...sorted[0], isDefault: true };
  }
  return sorted;
}

/** Editions shown in listings — public visibility only. */
export async function listPublicEditionsForGame(game: Game): Promise<Edition[]> {
  const all = await listEditionsForGame(game);
  const publicOnly = all.filter((e) => e.visibility === "public");
  return publicOnly.length > 0 ? publicOnly : all.slice(0, 1);
}

/** The edition to treat as "the" way to play, for install buttons and the launcher. */
export async function defaultEditionForGame(game: Game): Promise<Edition> {
  const editions = await listEditionsForGame(game);
  return editions.find((e) => e.isDefault) ?? editions[0];
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
    const stored = await fetchEditions({ gameSlug });
    /*
     * Merge exactly as loadStoredForGame does, rather than returning only the
     * stored rows when any exist.
     *
     * Those two disagreeing meant admin could not show an edition the launcher
     * was serving: one database row for a game hid every seed-only edition of
     * it, so a live install route was invisible to the person responsible for
     * it — unlistable, unopenable, uneditable. Stored still wins per slug.
     */
    const dbSlugs = new Set(stored.map((e) => e.slug));
    const seeds = seedEditions
      .filter((s) => s.gameSlug === gameSlug && !dbSlugs.has(s.slug))
      .map(seedToEdition);
    return [...stored, ...seeds].sort(compareEditions);
  } catch (err) {
    console.error("[editions] listAll failed:", err);
    const seeds = seedEditions.filter((s) => s.gameSlug === gameSlug).map(seedToEdition);
    return [...seeds].sort(compareEditions);
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
    const dbKeys = new Set(fromDb.map((e) => `${e.gameSlug}:${e.slug}`));
    const seeds = seedEditions
      .filter(
        (s) =>
          (s.visibility ?? "public") === "public" &&
          s.status !== "archived" &&
          !dbKeys.has(`${s.gameSlug}:${s.slug}`)
      )
      .map(seedToEdition);
    return [...fromDb, ...seeds];
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

/** How many editions each of the given games has stored, for admin lists. */
export async function editionCountsByGame(): Promise<Map<string, number>> {
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
  return counts;
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

/**
 * Point every edition of a renamed game at its new slug.
 *
 * Editions denormalize gameSlug, so without this a game rename would orphan
 * all of them — the game page would fall back to a virtual Official edition
 * and the real ones would be unreachable. Called from the game rename cascade.
 */
export async function cascadeEditionGameSlug(from: string, to: string): Promise<number> {
  if (!from || !to || from === to) return 0;
  try {
    await dbConnect();
    const res = await EditionModel.updateMany({ gameSlug: from }, { $set: { gameSlug: to } });
    return res.modifiedCount ?? 0;
  } catch (err) {
    console.error("[editions] slug cascade failed:", err);
    return 0;
  }
}
