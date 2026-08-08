/**
 * Match UGC that belongs to a game (or edition), not a catalog mod.
 * Documents with modSlug unset or null are game/edition-scoped.
 * Game-scoped content also requires editionSlug null (excludes edition pages).
 */
export function gameScopedUgcFilter(): { modSlug: null; editionSlug: null } {
  return { modSlug: null, editionSlug: null };
}

/** UGC posted from an edition page (still not a catalog mod). */
export function editionScopedUgcFilter(editionSlug: string): {
  modSlug: null;
  editionSlug: string;
} {
  return { modSlug: null, editionSlug };
}
