/**
 * Which games have a pickable public dedicated-server list.
 *
 * Kept separate from the provider registry so party host-mode resolution can
 * ask "does this game have a server browser?" without loading every master
 * query at module init.
 */

const DEDICATED_SERVER_GAMES: ReadonlySet<string> = new Set([
  "openra",
  "luanti",
  "openttd",
  "veloren",
  "beyond-all-reason",
  "supertuxkart",
  "xonotic",
  "unvanquished",
  "mindustry",
  "hedgewars",
  "battle-for-wesnoth",
  "warzone-2100",
  "zero-k",
  "0ad",
  "everquest",
  "asherons-call",
  "space-station-14",
  "starcraft",
  "morrowind",
  "tes3mp",
  "wolfenstein-enemy-territory",
  "counter-strike-2",
  "freeciv",
  "openarena",
  "flightgear",
  "team-fortress-2",
  "old-school-runescape",
  "star-wars-galaxies",
  "triplea",
  "renegade-x",
]);

/**
 * Games whose provider reports exactly one row that is not a server you pick.
 *
 * TripleA has a single global community lobby, and Star Wars Galaxies reports
 * one shard because it is the only one of the four that publishes a live count.
 * Offering either as a party "pick a server" list is not a choice.
 */
const SINGLE_MASTER_GAMES: ReadonlySet<string> = new Set(["triplea", "star-wars-galaxies"]);

/**
 * True when the game has an active, browseable dedicated server list.
 * Steam-concurrent-only titles and the single-master games above return false.
 */
export function hasServerBrowser(slug: string): boolean {
  return DEDICATED_SERVER_GAMES.has(slug) && !SINGLE_MASTER_GAMES.has(slug);
}

/** Structurally single-source games — counted in totals, absent from the browser. */
export function isSingleMasterGame(slug: string): boolean {
  return SINGLE_MASTER_GAMES.has(slug);
}

/** List of game slugs that have full dedicated server browser support. */
export function listServerBrowserSlugs(): string[] {
  return Array.from(DEDICATED_SERVER_GAMES).filter((slug) => !SINGLE_MASTER_GAMES.has(slug));
}
