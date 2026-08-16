import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import type { GameArt, GameFaq, InstallStep } from "@/lib/data/types";
import { mongoVisibleFilter, normalizeStatus, type CatalogStatus } from "@/lib/catalogStatus";
import type { ModHardwareRequirements } from "@/lib/hardware/types";
import { mods as seedMods } from "@/lib/data/mods";

const seedBySlug = new Map(seedMods.map((s) => [s.slug, s]));

function usableSeedMedia(url?: string): string | undefined {
  const value = String(url || "").trim();
  if (!value || value.startsWith("/games/") || value.startsWith("/mods/")) return undefined;
  return value;
}

export type CatalogModPublic = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  baseGameSlug: string;
  /** When set, mod is scoped to one edition; null/absent = base-game-wide. */
  editionSlug?: string | null;
  developerSlug: string;
  license: string;
  releaseYear: number;
  sizeMB: number;
  website: string;
  githubRepo?: string;
  downloadKind: "github-zip" | "direct-zip" | "external";
  assetPattern?: string;
  directUrl?: string;
  installRelativePath: string;
  art: GameArt;
  coverImage?: string;
  screenshots?: string[];
  managedBy: "admin" | "developer";
  status?: CatalogStatus;
  detectedVersion?: string;
  lastVersionCheckAt?: string;
  versionCheckStatus?: string;
  versionCheckNote?: string;
  autoUpdatePinned?: boolean;

  // ── Editorial depth ──────────────────────────────────────────
  // Optional so existing documents stay valid. installSteps and faq are
  // auto-derived at import; longDescription and whatItChanges need a person.
  /** 80+ words of original editorial. Not scraped project copy. */
  longDescription?: string;
  /** What this mod actually does to the base game — the thing people search. */
  whatItChanges?: string;
  /** Base game version compatibility, when it matters. */
  compatibility?: string;
  /** Empty/omit = all desktop OSes. */
  platforms?: ("Windows" | "macOS" | "Linux")[];
  /** Additive structured hardware requirements. */
  hardwareRequirements?: ModHardwareRequirements | null;
  installSteps?: InstallStep[];
  faq?: GameFaq[];
  updatedAt?: string;
};

/**
 * The only fields a mod card actually renders.
 *
 * Declared as a Pick so a full CatalogModPublic still satisfies it structurally
 * — every existing caller keeps working — while list pages can build genuinely
 * slim objects and keep the rest out of the RSC payload sent to the browser.
 */
export type ModCardMod = Pick<
  CatalogModPublic,
  "slug" | "title" | "tagline" | "baseGameSlug" | "sizeMB" | "license" | "coverImage" | "art" | "platforms"
> & { tags?: string[] };

/** Narrow a mod down to just the card fields, for passing to client components. */
export function toModCard(mod: ModCardMod): ModCardMod {
  return {
    slug: mod.slug,
    title: mod.title,
    tagline: mod.tagline,
    baseGameSlug: mod.baseGameSlug,
    sizeMB: mod.sizeMB,
    license: mod.license,
    coverImage: mod.coverImage,
    art: mod.art,
    platforms: mod.platforms,
    tags: "tags" in mod && Array.isArray(mod.tags) ? mod.tags : undefined,
  };
}

export type ModInstallMeta = {
  slug: string;
  title: string;
  baseGameSlug: string;
  downloadKind: "github-zip" | "direct-zip" | "external";
  repo: string | null;
  assetPattern: string | null;
  url: string | null;
  installRelativePath: string;
  platforms?: ("Windows" | "macOS" | "Linux")[];
  approxSize: string | null;
  art: [string, string];
};

type LeanMod = Record<string, unknown>;

function toMod(doc: LeanMod): CatalogModPublic {
  const seed = seedBySlug.get(String(doc.slug));
  return {
    slug: String(doc.slug),
    title: String(doc.title),
    tagline: String(doc.tagline),
    description: String(doc.description) || seed?.description || "",
    baseGameSlug: String(doc.baseGameSlug),
    editionSlug: (doc.editionSlug as string) || null,
    developerSlug: String(doc.developerSlug),
    license: String(doc.license),
    releaseYear: Number(doc.releaseYear),
    sizeMB: Number(doc.sizeMB),
    website: String(doc.website),
    githubRepo: (doc.githubRepo as string) || undefined,
    downloadKind: (doc.downloadKind as CatalogModPublic["downloadKind"]) || "github-zip",
    assetPattern: (doc.assetPattern as string) || undefined,
    directUrl: (doc.directUrl as string) || undefined,
    installRelativePath: String(doc.installRelativePath ?? "mods"),
    art: (doc.art as GameArt) || seed?.art || { from: "#1e293b", to: "#64748b", icon: "Package" },
    coverImage: (doc.coverImage as string) || usableSeedMedia(seed?.coverImage),
    screenshots: (doc.screenshots as string[])?.length
      ? (doc.screenshots as string[])
      : seed?.screenshots?.map((u) => usableSeedMedia(u)).filter((u): u is string => Boolean(u)),
    managedBy: (doc.managedBy as "admin" | "developer") || "admin",
    status: normalizeStatus(doc),
    detectedVersion: (doc.detectedVersion as string) || undefined,
    lastVersionCheckAt: (doc as { lastVersionCheckAt?: Date }).lastVersionCheckAt
      ? new Date((doc as { lastVersionCheckAt: Date }).lastVersionCheckAt).toISOString()
      : undefined,
    versionCheckStatus: (doc.versionCheckStatus as string) || undefined,
    versionCheckNote: (doc.versionCheckNote as string) || undefined,
    autoUpdatePinned: doc.autoUpdatePinned !== false,

    longDescription: (doc.longDescription as string) || seed?.longDescription,
    whatItChanges: (doc.whatItChanges as string) || seed?.whatItChanges,
    compatibility: (doc.compatibility as string) || seed?.compatibility,
    platforms: Array.isArray(doc.platforms)
      ? (doc.platforms as CatalogModPublic["platforms"])
      : undefined,
    hardwareRequirements: (doc.hardwareRequirements as CatalogModPublic["hardwareRequirements"]) || null,
    installSteps: (doc.installSteps as InstallStep[])?.length
      ? (doc.installSteps as InstallStep[])
      : undefined,
    faq: (doc.faq as GameFaq[])?.length ? (doc.faq as GameFaq[]) : undefined,
    updatedAt: (doc as { updatedAt?: Date }).updatedAt
      ? new Date((doc as { updatedAt: Date }).updatedAt).toISOString()
      : undefined,
  };
}

function sizeLabel(sizeMB: number): string | null {
  if (!sizeMB) return null;
  return sizeMB >= 1000 ? `~${(sizeMB / 1000).toFixed(1)} GB` : `~${sizeMB} MB`;
}

export function toInstallMeta(mod: CatalogModPublic): ModInstallMeta {
  return {
    slug: mod.slug,
    title: mod.title,
    baseGameSlug: mod.baseGameSlug,
    downloadKind: mod.downloadKind,
    repo: mod.githubRepo ?? null,
    assetPattern: mod.assetPattern ?? null,
    url: mod.downloadKind === "direct-zip" || mod.downloadKind === "external" ? mod.directUrl ?? mod.website : null,
    installRelativePath: mod.installRelativePath || "",
    platforms: mod.platforms?.length ? mod.platforms : undefined,
    approxSize: sizeLabel(mod.sizeMB),
    art: [mod.art.from, mod.art.to],
  };
}

/**
 * Editorial fields a list/grid view never renders.
 *
 * These are the bulk of a mod document — `longDescription` alone is 80+ words
 * by editorial policy, and `faq`/`installSteps`/`screenshots` are unbounded
 * arrays. Fetching them for a card grid cost twice over: once pulling them out
 * of Atlas, then again serializing them into the RSC payload for the client
 * component that renders the grid. /mods was shipping ~1.2 MB of HTML for a
 * view that reads seven fields per mod.
 *
 * Every field here is optional on CatalogModPublic, so a projected document is
 * still a valid CatalogModPublic — callers that ask for the card view simply
 * see them as undefined rather than getting a different type.
 */
const CARD_EXCLUDED_FIELDS = [
  "longDescription",
  "whatItChanges",
  "compatibility",
  "hardwareRequirements",
  "installSteps",
  "faq",
  "screenshots",
] as const;

const CARD_PROJECTION = CARD_EXCLUDED_FIELDS.map((f) => `-${f}`).join(" ");

export type ListModsOptions = {
  baseGameSlug?: string;
  /** null = base-wide only; string = that edition; omit = any edition. */
  editionSlug?: string | null;
  includeUnpublished?: boolean;
  includeTesting?: boolean;
  /**
   * "card" omits the heavy editorial fields above. Use it for any grid,
   * listing or count — anything that is not a detail page.
   */
  view?: "full" | "card";
};

/**
 * Cached wrapper around the uncached query below.
 *
 * Reading every visible mod is by far the most expensive query the site makes
 * — measured at ~22s against production for the full list, versus ~2s for a
 * single-game filter, so the cost scales with how many documents come back.
 * Pages that show the whole catalog are also the ones every visitor lands on,
 * and because they call getServerSession they are dynamic and never CDN-cached,
 * so without this each visitor paid that cost from scratch.
 *
 * `includeTesting` is part of the cache key rather than read inside the cached
 * function: cookies are not readable from a cache scope, and testers must not
 * be served the public list (or vice versa) from a shared entry.
 *
 * Invalidated by revalidateTag("mods") wherever a mod is written, so admin
 * edits still show up immediately rather than waiting out the window.
 */
export async function listMods(opts?: ListModsOptions): Promise<CatalogModPublic[]> {
  // Unpublished reads are admin-only and must never serve a cached list.
  if (opts?.includeUnpublished) return listModsUncached(opts);

  const key = JSON.stringify({
    baseGameSlug: opts?.baseGameSlug ?? null,
    editionSlug: opts && "editionSlug" in opts ? opts.editionSlug ?? null : "any",
    includeTesting: Boolean(opts?.includeTesting),
    view: opts?.view ?? "full",
  });

  return unstable_cache(() => listModsUncached(opts), ["mods-list", key], {
    revalidate: 300,
    tags: ["mods", "catalog"],
  })();
}

async function listModsUncached(opts?: ListModsOptions): Promise<CatalogModPublic[]> {
  let dbMods: CatalogModPublic[] = [];
  try {
    await dbConnect();
    const parts: Record<string, unknown>[] = [];
    if (opts?.baseGameSlug) parts.push({ baseGameSlug: opts.baseGameSlug });
    if (opts && "editionSlug" in opts) {
      // null matches both explicit null and missing field (legacy docs).
      parts.push({ editionSlug: opts.editionSlug ?? null });
    }
    if (!opts?.includeUnpublished) {
      parts.push(mongoVisibleFilter({ includeTesting: Boolean(opts?.includeTesting) }));
    }
    const filter =
      parts.length === 0 ? {} : parts.length === 1 ? parts[0]! : { $and: parts };
    const query = CatalogMod.find(filter).sort({ title: 1 });
    if (opts?.view === "card") query.select(CARD_PROJECTION);
    const docs = await query.lean();
    dbMods = docs.map((d) => toMod(d as LeanMod));
  } catch (err) {
    console.error("[mods] listMods failed:", err);
  }

  return dbMods.sort((a, b) => a.title.localeCompare(b.title));
}

export async function listAllMods(): Promise<
  (CatalogModPublic & {
    published: boolean;
    status: CatalogStatus;
    updatedAt?: string;
    ownerUserId?: string | null;
  })[]
> {
  let dbMods: (CatalogModPublic & {
    published: boolean;
    status: CatalogStatus;
    updatedAt?: string;
    ownerUserId?: string | null;
  })[] = [];
  try {
    await dbConnect();
    const docs = await CatalogMod.find({}).sort({ updatedAt: -1 }).lean();
    dbMods = docs.map((d) => {
      const lean = d as LeanMod;
      const status = normalizeStatus(lean);
      return {
        ...toMod(lean),
        published: status === "published",
        status,
        updatedAt: (d as { updatedAt?: Date }).updatedAt
          ? new Date((d as { updatedAt: Date }).updatedAt).toISOString()
          : undefined,
        managedBy: (lean.managedBy as "admin" | "developer") || "admin",
        ownerUserId: lean.ownerUserId ? String(lean.ownerUserId) : null,
      };
    });
  } catch (err) {
    console.error("[mods] listAllMods failed:", err);
  }
  return dbMods;
}

export async function getMod(
  slug: string,
  opts?: { includeUnpublished?: boolean; includeTesting?: boolean }
): Promise<CatalogModPublic | undefined> {
  try {
    await dbConnect();
    const query: Record<string, unknown> = opts?.includeUnpublished
      ? { slug }
      : { $and: [{ slug }, mongoVisibleFilter({ includeTesting: Boolean(opts?.includeTesting) })] };
    const doc = await CatalogMod.findOne(query).lean();
    if (doc) return toMod(doc as LeanMod);
  } catch (err) {
    console.error("[mods] getMod failed:", err);
  }
  return undefined;
}

export async function modsForGame(
  baseGameSlug: string,
  opts?: { includeTesting?: boolean }
): Promise<CatalogModPublic[]> {
  // Base game page: prefer mods that are not edition-scoped.
  return listMods({
    baseGameSlug,
    editionSlug: null,
    includeUnpublished: false,
    includeTesting: opts?.includeTesting,
  });
}

/** Mods tagged for a specific edition (edition page mods tab). */
export async function modsForEdition(
  baseGameSlug: string,
  editionSlug: string,
  opts?: { includeTesting?: boolean }
): Promise<CatalogModPublic[]> {
  return listMods({
    baseGameSlug,
    editionSlug,
    includeUnpublished: false,
    includeTesting: opts?.includeTesting,
  });
}

export async function getModAdmin(slug: string) {
  try {
    await dbConnect();
    const doc = await CatalogMod.findOne({ slug }).lean();
    if (doc) return doc;
  } catch (err) {
    console.error("[mods] getModAdmin failed:", err);
  }
  return null;
}

export async function modCountsByGame(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    await dbConnect();
    const rows = await CatalogMod.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$baseGameSlug", count: { $sum: 1 } } },
    ]);
    for (const r of rows) {
      counts.set(r._id, r.count);
    }
  } catch (err) {
    console.error("[mods] counts failed:", err);
  }
  return counts;
}
