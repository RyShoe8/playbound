/**
 * Allowlists for `scripts/insert-catalog-wave.ts` (deploy catalog wave).
 * Kept in a separate module so tests can import without connecting to Mongo.
 *
 * Insert lists create rows only when absent.
 * Patch maps $set ONLY the named fields on existing rows — never other games,
 * never other fields, never upsert.
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

/**
 * Existing catalog games: $set ONLY these fields.
 * Keys are game slugs. Values are the exact CatalogGame paths allowed.
 * BombSquad / AssaultCube platform + install wave — nothing else.
 */
export const PATCH_GAME_FIELDS: Readonly<Record<string, readonly string[]>> = {
  bombsquad: ["launcherInstall", "platforms", "androidStoreUrl"],
  assaultcube: ["launcherInstall", "systemRequirements", "hardwareRequirements"],
};

/**
 * Existing editions: $set ONLY these fields.
 * Keys are `gameSlug/editionSlug`. Values are dotted paths under the edition.
 */
export const PATCH_EDITION_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "bombsquad/standalone-pc": [
    "name",
    "description",
    "version",
    "installConfig.playbound_installer",
  ],
};
