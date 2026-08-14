import { cache } from "react";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import type { Game } from "@/lib/data/types";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import type { LauncherInstall } from "@/lib/launcherInstall";
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

type LeanEdition = Record<string, unknown>;

/**
 * This module deliberately never imports from "@/lib/catalog".
 *
 * Catalog needs editions (search, game pages) and editions need game data to
 * synthesize virtual defaults, which would be a require cycle. Instead, every
 * function that needs a game takes the Game object as an argument — the caller
 * already has it.
 */

const VIRTUAL_PREFIX = "virtual:";

export function isVirtualId(id: string): boolean {
  return id.startsWith(VIRTUAL_PREFIX);
}

function str(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function toEdition(doc: LeanEdition): Edition {
  const branding = (doc.branding as Record<string, unknown>) ?? {};
  const links = (doc.links as Record<string, unknown>) ?? {};
  const requirements = doc.requirements as Record<string, unknown> | null;

  return {
    id: String(doc._id),
    gameId: doc.gameId ? String(doc.gameId) : undefined,
    gameSlug: str(doc.gameSlug),
    slug: str(doc.slug),
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
      website: (links.website as string) || undefined,
      discord: (links.discord as string) || undefined,
      wiki: (links.wiki as string) || undefined,
      github: (links.github as string) || undefined,
      forum: (links.forum as string) || undefined,
    },

    installMethod: (doc.installMethod as InstallMethod) ?? "manual",
    installConfig: (doc.installConfig as EditionInstallConfig) ?? {},

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
    return await fetchEditions({ gameSlug });
  } catch (err) {
    console.error("[editions] read failed:", err);
    return [];
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

/** True when the player has a real choice between multiple editions. */
export function hasChoosableEditions(editions: Edition[]): boolean {
  return Array.isArray(editions) && editions.length > 1;
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
export async function getEditionById(id: string): Promise<Edition | undefined> {
  if (!id || isVirtualId(id)) return undefined;
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
    return [...stored].sort(compareEditions);
  } catch (err) {
    console.error("[editions] listAll failed:", err);
    return [];
  }
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
    return await fetchEditions({ visibility: "public", status: { $ne: "archived" } });
  } catch (err) {
    console.error("[editions] listAllPublic failed:", err);
    return [];
  }
}

/** How many editions each of the given games has stored, for admin lists. */
export async function editionCountsByGame(): Promise<Map<string, number>> {
  try {
    await dbConnect();
    const rows = await EditionModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$gameSlug", count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [r._id, r.count]));
  } catch (err) {
    console.error("[editions] counts failed:", err);
    return new Map();
  }
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
 * The identity every edition-scoped analytics event carries.
 *
 * Built in one place so each call site cannot drift, and so a virtual edition
 * still reports a stable id (`virtual:<gameSlug>`) rather than dropping out of
 * the funnel for games that predate editions.
 */
export function editionTelemetryProps(
  game: Pick<Game, "slug" | "title">,
  edition: Edition
): {
  gameSlug: string;
  gameTitle: string;
  editionId: string;
  editionSlug: string;
  editionName: string;
  editionType: string;
} {
  return {
    gameSlug: game.slug,
    gameTitle: game.title,
    editionId: edition.id,
    editionSlug: edition.slug,
    editionName: edition.name,
    editionType: edition.type,
  };
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
