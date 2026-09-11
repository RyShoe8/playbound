/**
 * Allowlists for `scripts/insert-catalog-wave.ts` (deploy catalog wave).
 * Kept in a separate module so tests can import without connecting to Mongo.
 *
 * Insert lists create rows only when absent.
 * Patch maps $set ONLY the named fields on existing rows — never other games,
 * never other fields, never upsert.
 * Retire lists hide+archive existing editions — never delete, never upsert.
 */

/** Parent games to create only when absent. Draft until a human publishes. */
export const NEW_GAME_SLUGS: readonly string[] = [
  "trackmania",
  "the-spike-cross",
  "populous-the-beginning",
  "earth-2140-trilogy",
  "super-sidekicks",
  "baseball-stars-2",
  "soccer-brawl",
  "x-men-arcade-remake",
  "tmnt-rescue-palooza",
  "relic-hunters-zero-remix",
  "srb2kart",
  "lovers-in-a-dangerous-spacetime",
  "flatout-2",
];

/** `gameSlug/editionSlug` pairs to create only when absent. */
export const NEW_EDITION_KEYS: readonly string[] = [
  "s-t-a-l-k-e-r-call-of-pripyat/official",
  "s-t-a-l-k-e-r-call-of-pripyat/anomaly",
  "s-t-a-l-k-e-r-shadow-of-chernobyl/official",
  "s-t-a-l-k-e-r-shadow-of-chernobyl/lost-alpha",
  "s-t-a-l-k-e-r-shadow-of-chernobyl/true-stalker",
  "populous-the-beginning/official",
  "populous-the-beginning/populous-reincarnated",
  "earth-2140-trilogy/official",
  "earth-2140-trilogy/opene2140",
  "super-sidekicks/official",
  "baseball-stars-2/official",
  "soccer-brawl/official",
];

/**
 * Mod slugs to create only when absent. Empty this wave — OpenE2140 ships as
 * an edition of earth-2140-trilogy, not a free OpenRA mod row.
 */
export const NEW_MOD_SLUGS: readonly string[] = [];

/**
 * Existing catalog games: $set ONLY these fields.
 */
export const PATCH_GAME_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "alien-swarm": [
    "qualityBar",
    "longDescription",
    "whyWePickedIt",
    "thatOneThing",
    "bestFor",
    "notFor",
    "comparableTo",
    "faq",
    "installSteps",
    "systemRequirements",
    "hardwareRequirements",
  ],
  freetrain: [
    "qualityBar",
    "longDescription",
    "whyWePickedIt",
    "thatOneThing",
    "bestFor",
    "notFor",
    "comparableTo",
    "faq",
    "installSteps",
    "systemRequirements",
    "hardwareRequirements",
    "launcherInstall",
  ],
  "hurry-curry": ["platforms", "features", "launcherInstall"],
  "idle-slayer": [
    "platforms",
    "androidStoreUrl",
    "iosStoreUrl",
    "launchMethods",
    "steamDeck",
    "steamAppId",
    "browserPlayable",
    "launcherInstall",
    "website",
  ],
  "seven-kingdoms-ancient-adversaries": ["launcherInstall"],
  "s-t-a-l-k-e-r-call-of-pripyat": [
    "longDescription",
    "whyWePickedIt",
    "installSteps",
    "faq",
  ],
  "sky-children-of-the-light": [
    "platforms",
    "androidStoreUrl",
    "iosStoreUrl",
    "launchMethods",
    "steamDeck",
    "steamAppId",
    "browserPlayable",
    "launcherInstall",
    "website",
    "installSteps",
  ],
  "slapshot-rebound": [
    "features",
    "systemRequirements",
    "hardwareRequirements",
    "launcherInstall",
  ],
  "space-station-14": ["launcherInstall", "installSteps"],
  teeworlds: [
    "platforms",
    "features",
    "launcherInstall",
    "systemRequirements",
    "hardwareRequirements",
  ],
  "the-dark-mod": [
    "platforms",
    "features",
    "launcherInstall",
    "systemRequirements",
    "hardwareRequirements",
  ],
  "the-spike-cross": [
    "platforms",
    "androidStoreUrl",
    "iosStoreUrl",
    "features",
    "launcherInstall",
    "systemRequirements",
    "hardwareRequirements",
    "installSteps",
  ],
  "unknown-horizons": [
    "platforms",
    "launcherInstall",
    "systemRequirements",
    "hardwareRequirements",
  ],
  "x-men-arcade-remake": ["launcherInstall"],
  "tmnt-rescue-palooza": ["launcherInstall"],
  morrowind: ["launcherInstall"],
};

/** Existing editions: $set ONLY these fields. */
export const PATCH_EDITION_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "s-t-a-l-k-e-r-call-of-pripyat/official": ["name", "description"],
  "s-t-a-l-k-e-r-call-of-pripyat/anomaly": [
    "name",
    "description",
    "shortDescription",
    "visibility",
    "status",
    "installMethod",
    "installConfig",
    "requirements",
    "hardwareRequirements",
  ],
  // OpenMW 0.51 ships Windows-x64.exe; live recipe still pointed at win64.zip.
  "morrowind/openmw": ["installConfig"],
  // Keep TES3MP desktop zip pattern in sync (VR-latest miss).
  "morrowind/tes3mp": ["installConfig"],
  // Lost Alpha: launch XR_3DA, not the Configurator tweaker UI.
  "s-t-a-l-k-e-r-shadow-of-chernobyl/lost-alpha": ["installMethod", "installConfig"],
};

/**
 * Existing editions to retire (hide from public listings). $set only
 * visibility + status — never delete, never upsert.
 * Anomaly is restored this wave (see NEW_EDITION_KEYS + PATCH_EDITION_FIELDS).
 */
export const RETIRE_EDITION_KEYS: readonly string[] = [
  "s-t-a-l-k-e-r-call-of-pripyat/gamma",
  "s-t-a-l-k-e-r-call-of-pripyat/gunslinger",
];

/**
 * Existing catalog mods: $set ONLY these fields. No upsert.
 * holocure-rich-presence stays draft so seed cannot resurrect a public page.
 */
export const PATCH_MOD_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "holocure-rich-presence": ["status", "published"],
};
