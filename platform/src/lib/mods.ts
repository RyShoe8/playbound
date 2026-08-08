import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import type { GameArt, GameFaq, InstallStep } from "@/lib/data/types";
import { mongoVisibleFilter, normalizeStatus, type CatalogStatus } from "@/lib/catalogStatus";

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
  installSteps?: InstallStep[];
  faq?: GameFaq[];
  updatedAt?: string;
};

export type ModInstallMeta = {
  slug: string;
  title: string;
  baseGameSlug: string;
  downloadKind: "github-zip" | "direct-zip" | "external";
  repo: string | null;
  assetPattern: string | null;
  url: string | null;
  installRelativePath: string;
  approxSize: string | null;
  art: [string, string];
};

type LeanMod = Record<string, unknown>;

function toMod(doc: LeanMod): CatalogModPublic {
  return {
    slug: String(doc.slug),
    title: String(doc.title),
    tagline: String(doc.tagline),
    description: String(doc.description),
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
    art: doc.art as GameArt,
    coverImage: (doc.coverImage as string) || undefined,
    screenshots: (doc.screenshots as string[])?.length ? (doc.screenshots as string[]) : undefined,
    managedBy: (doc.managedBy as "admin" | "developer") || "admin",
    status: normalizeStatus(doc),
    detectedVersion: (doc.detectedVersion as string) || undefined,
    lastVersionCheckAt: (doc as { lastVersionCheckAt?: Date }).lastVersionCheckAt
      ? new Date((doc as { lastVersionCheckAt: Date }).lastVersionCheckAt).toISOString()
      : undefined,
    versionCheckStatus: (doc.versionCheckStatus as string) || undefined,
    versionCheckNote: (doc.versionCheckNote as string) || undefined,
    autoUpdatePinned: doc.autoUpdatePinned !== false,

    longDescription: (doc.longDescription as string) || undefined,
    whatItChanges: (doc.whatItChanges as string) || undefined,
    compatibility: (doc.compatibility as string) || undefined,
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
    approxSize: sizeLabel(mod.sizeMB),
    art: [mod.art.from, mod.art.to],
  };
}

export async function listMods(opts?: {
  baseGameSlug?: string;
  /** null = base-wide only; string = that edition; omit = any edition. */
  editionSlug?: string | null;
  includeUnpublished?: boolean;
  includeTesting?: boolean;
}): Promise<CatalogModPublic[]> {
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
    const docs = await CatalogMod.find(filter).sort({ title: 1 }).lean();
    return docs.map((d) => toMod(d as LeanMod));
  } catch (err) {
    console.error("[mods] listMods failed:", err);
    return [];
  }
}

export async function listAllMods(): Promise<
  (CatalogModPublic & {
    published: boolean;
    status: CatalogStatus;
    updatedAt?: string;
    ownerUserId?: string | null;
  })[]
> {
  try {
    await dbConnect();
    const docs = await CatalogMod.find({}).sort({ updatedAt: -1 }).lean();
    return docs.map((d) => {
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
    return [];
  }
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
    return doc ? toMod(doc as LeanMod) : undefined;
  } catch (err) {
    console.error("[mods] getMod failed:", err);
    return undefined;
  }
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
    return await CatalogMod.findOne({ slug }).lean();
  } catch {
    return null;
  }
}

export async function modCountsByGame(): Promise<Map<string, number>> {
  try {
    await dbConnect();
    const rows = await CatalogMod.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$baseGameSlug", count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [r._id, r.count]));
  } catch (err) {
    console.error("[mods] counts failed:", err);
    return new Map();
  }
}
