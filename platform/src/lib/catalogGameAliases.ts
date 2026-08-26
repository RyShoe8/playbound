/**
 * Canonical CatalogGame.slug vs legacy mod/edition slugs.
 *
 * KeeperFX mods use baseGameSlug "keeperfx" while the catalog game is
 * dungeon-keeper-gold. Aleph One mods use "alephone" while the game is
 * marathon-2. Resolve these everywhere dependencies, mod lists, and party
 * config sync are evaluated so the audit and launcher agree.
 */

export const CATALOG_GAME_SLUG_ALIASES: Record<string, string> = {
  alephone: "marathon-2",
  keeperfx: "dungeon-keeper-gold",
  "dungeon-keeper": "dungeon-keeper-gold",
  /*
   * Three published mods carry baseGameSlug "gradius-remake" while the catalog
   * game is titled "Gradius Remake" under the slug "gradius". Without the
   * alias they hang off a base game that does not exist, so they never appear
   * on the game they belong to.
   *
   * TODO: unresolved conflict (2026-08-26) — a separate uncommitted batch of
   * work pointed this the other way ("gradius": "gradius-remake"), reasoning
   * from games.ts, whose seed slug has always been "gradius-remake". Per
   * AGENTS.md the live database is authoritative over that seed file and can
   * disagree with it; this line was verified against the live catalog when it
   * was written, but the game is unpublished right now (both slugs 404 and
   * neither is in sitemap.xml), so it can't be re-verified from here. Confirm
   * the real slug in the admin panel before touching this either way.
   */
  "gradius-remake": "gradius",
  "metal-slug": "metal-slug-remake",
  "re-volt": "re-volt-rvgl",
  revolt: "re-volt-rvgl",
  rvgl: "re-volt-rvgl",
  wipeout: "wipeout-rewrite",
  "wipeout-phantom-edition": "wipeout-rewrite",
};

/** Map a mod/edition slug alias to the canonical CatalogGame.slug. */
export function canonicalCatalogGameSlug(slug: string | null | undefined): string {
  const s = String(slug || "").trim();
  if (!s) return "";
  return CATALOG_GAME_SLUG_ALIASES[s] || s;
}

/** Every baseGameSlug value mods may carry for this catalog game. */
export function modBaseGameSlugsForCatalogGame(gameSlug: string): string[] {
  const canonical = canonicalCatalogGameSlug(gameSlug);
  const slugs = new Set<string>([canonical]);
  if (gameSlug) slugs.add(gameSlug);
  for (const [alias, target] of Object.entries(CATALOG_GAME_SLUG_ALIASES)) {
    if (target === canonical) slugs.add(alias);
  }
  return [...slugs];
}

/** Resolve a mod's baseGameSlug to the catalog game it depends on. */
export function modDependsOnCatalogGameSlug(modBaseGameSlug: string): string {
  return canonicalCatalogGameSlug(modBaseGameSlug);
}
