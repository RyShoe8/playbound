/**
 * Allowlists for `scripts/insert-catalog-wave.ts` (deploy insert-only wave).
 * Kept in a separate module so tests can import without connecting to Mongo.
 */

/** Parent games to create only when absent. Draft until a human publishes. */
export const NEW_GAME_SLUGS: readonly string[] = [
  "trackmania",
  "the-spike-cross",
  "populous-the-beginning",
  "earth-2140-trilogy",
];

/** `gameSlug/editionSlug` pairs to create only when absent. */
export const NEW_EDITION_KEYS: readonly string[] = [
  "s-t-a-l-k-e-r-call-of-pripyat/official",
  "s-t-a-l-k-e-r-shadow-of-chernobyl/official",
  "populous-the-beginning/official",
  "populous-the-beginning/populous-reincarnated",
  "earth-2140-trilogy/official",
  "earth-2140-trilogy/opene2140",
];

/**
 * Mod slugs to create only when absent. Empty this wave — OpenE2140 ships as
 * an edition of earth-2140-trilogy, not a free OpenRA mod row.
 */
export const NEW_MOD_SLUGS: readonly string[] = [];
