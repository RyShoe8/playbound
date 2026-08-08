/**
 * Match UGC that belongs to a game (or edition), not a catalog mod.
 * Documents with modSlug unset or null are game-scoped.
 */
export function gameScopedUgcFilter(): { modSlug: null } {
  return { modSlug: null };
}
