/**
 * Library rows store one primary edition per game. Official / unspecified
 * installs must not read as "wrong edition" against a party that just picked
 * the game.
 */

export const BASE_EDITION_KEY = "__base__";

export function isBaseEditionSlug(slug: string | null | undefined): boolean {
  if (!slug) return true;
  const n = slug.trim().toLowerCase();
  return n === BASE_EDITION_KEY || n === "official" || n === "default";
}

/** True when this machine has the game and the edition the party needs. */
export function libraryHasRequiredEdition(
  installed: Iterable<string>,
  required: string | null | undefined
): boolean {
  const set = installed instanceof Set ? installed : new Set(installed);
  if (set.size === 0) return false;
  if (isBaseEditionSlug(required)) return true;
  return set.has(String(required));
}
