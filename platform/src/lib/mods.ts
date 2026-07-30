import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import type { GameArt, GameFaq, InstallStep } from "@/lib/data/types";

export type CatalogModPublic = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  baseGameSlug: string;
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
  includeUnpublished?: boolean;
}): Promise<CatalogModPublic[]> {
  try {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (opts?.baseGameSlug) filter.baseGameSlug = opts.baseGameSlug;
    if (!opts?.includeUnpublished) filter.published = true;
    const docs = await CatalogMod.find(filter).sort({ title: 1 }).lean();
    return docs.map((d) => toMod(d as LeanMod));
  } catch (err) {
    console.error("[mods] listMods failed:", err);
    return [];
  }
}

export async function listAllMods(): Promise<(CatalogModPublic & { published: boolean; updatedAt?: string })[]> {
  try {
    await dbConnect();
    const docs = await CatalogMod.find({}).sort({ updatedAt: -1 }).lean();
    return docs.map((d) => ({
      ...toMod(d as LeanMod),
      published: Boolean((d as LeanMod).published),
      updatedAt: (d as { updatedAt?: Date }).updatedAt
        ? new Date((d as { updatedAt: Date }).updatedAt).toISOString()
        : undefined,
      managedBy: ((d as LeanMod).managedBy as "admin" | "developer") || "admin",
      ownerUserId: (d as LeanMod).ownerUserId ? String((d as LeanMod).ownerUserId) : null,
    }));
  } catch (err) {
    console.error("[mods] listAllMods failed:", err);
    return [];
  }
}

export async function getMod(
  slug: string,
  opts?: { includeUnpublished?: boolean }
): Promise<CatalogModPublic | undefined> {
  try {
    await dbConnect();
    const filter: Record<string, unknown> = { slug };
    if (!opts?.includeUnpublished) filter.published = true;
    const doc = await CatalogMod.findOne(filter).lean();
    return doc ? toMod(doc as LeanMod) : undefined;
  } catch (err) {
    console.error("[mods] getMod failed:", err);
    return undefined;
  }
}

export async function modsForGame(baseGameSlug: string): Promise<CatalogModPublic[]> {
  return listMods({ baseGameSlug, includeUnpublished: false });
}

export async function getModAdmin(slug: string) {
  try {
    await dbConnect();
    return await CatalogMod.findOne({ slug }).lean();
  } catch {
    return null;
  }
}
