/**
 * Match UGC that belongs to a game (or edition), not a catalog mod or gear.
 * Documents with modSlug / gearSlug unset or null are game/edition-scoped.
 * Game-scoped content also requires editionSlug null (excludes edition pages).
 */
export function gameScopedUgcFilter(): {
  modSlug: null;
  editionSlug: null;
  gearSlug: null;
} {
  return { modSlug: null, editionSlug: null, gearSlug: null };
}

/** UGC posted from an edition page (still not a catalog mod or gear). */
export function editionScopedUgcFilter(editionSlug: string): {
  modSlug: null;
  editionSlug: string;
  gearSlug: null;
} {
  return { modSlug: null, editionSlug, gearSlug: null };
}

/** UGC posted from a gear product page. */
export function gearScopedUgcFilter(gearSlug: string): {
  gearSlug: string;
  modSlug: null;
  editionSlug: null;
} {
  return { gearSlug, modSlug: null, editionSlug: null };
}
