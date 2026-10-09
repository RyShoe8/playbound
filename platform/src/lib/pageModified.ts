/**
 * When anything on a game page last changed.
 *
 * Derived, never stored: the newest timestamp among the game, its editions and
 * its mods, so the date moves on its own whenever any of them is edited and
 * nobody has to remember to bump it.
 */
export function latestModified(
  ...sources: Array<string | Date | null | undefined | Array<string | Date | null | undefined>>
): string | null {
  let best = 0;
  for (const source of sources.flat()) {
    if (!source) continue;
    const t = new Date(source).getTime();
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best > 0 ? new Date(best).toISOString() : null;
}

export function gamePageModified(
  game: { updatedAt?: string; adminUpdatedAt?: string | null },
  editions: Array<{ updatedAt?: string }> = [],
  mods: Array<{ updatedAt?: string }> = []
): string | null {
  return latestModified(
    game.updatedAt,
    game.adminUpdatedAt,
    editions.map((e) => e.updatedAt),
    mods.map((m) => m.updatedAt)
  );
}
