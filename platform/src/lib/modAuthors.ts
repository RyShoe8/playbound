import { modAuthors, modAuthorsBySlug, type ModAuthor } from "@/lib/data/modAuthors";
import { listMods } from "@/lib/mods";
import type { CatalogModPublic } from "@/lib/mods";

export type { ModAuthor };

/** Where an author publishes, for the profile link's label. */
export const HOST_LABELS: Record<ModAuthor["host"], string> = {
  github: "GitHub",
  luanti: "Luanti ContentDB",
  codeberg: "Codeberg",
  gitlab: "GitLab",
  bananas: "OpenTTD BaNaNaS",
  modio: "mod.io",
  moddb: "ModDB",
  sourceforge: "SourceForge",
};

export function getModAuthor(slug: string): ModAuthor | undefined {
  return modAuthorsBySlug.get(slug);
}

export function listModAuthors(): ModAuthor[] {
  return [...modAuthors].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Mods credited to this author.
 *
 * Reads the live catalog rather than the seed, because attribution is applied
 * to the database by the catalog wave and the seed lags behind it.
 */
export async function modsByAuthor(slug: string): Promise<CatalogModPublic[]> {
  const all = await listMods();
  return all
    .filter((m) => m.developerSlug === slug)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Author slugs that actually have a published mod, for prerender + sitemap. */
export async function authorsWithMods(): Promise<string[]> {
  const all = await listMods();
  const credited = new Set(all.map((m) => m.developerSlug));
  return modAuthors.filter((a) => credited.has(a.slug)).map((a) => a.slug);
}
