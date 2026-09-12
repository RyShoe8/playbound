/**
 * Curated party seat counts for the party game picker.
 *
 * Used when Mongo `maxPlayers` is still null. Explicit low values hide a game
 * from larger parties; unknown slugs fall back to PARTY_MAX_SIZE in fitsPartySize.
 */
export const partyMaxPlayersBySlug: Readonly<Record<string, number>> = {
  // True 2P (or local-2) titles that should not appear for parties of 3+
  "relic-hunters-zero-remix": 2,
  "soccer-brawl": 2,
  "baseball-stars-2": 2,
  "super-sidekicks": 2,
  "metal-slug-community-remake": 2,

  // Common party / online multiplayer capacities
  freedoom: 64,
  openra: 8,
  teeworlds: 16,
  assaultcube: 32,
  holocure: 4,
  "lovers-in-a-dangerous-spacetime": 4,
  "alien-swarm": 4,
  "srb2kart": 16,
  "zero-k": 16,
  "beyond-all-reason": 16,
  "0ad": 8,
  hedgewars: 8,
  "warzone-2100": 8,
  mindustry: 32,
  "space-station-14": 80,
  "xonotic": 32,
  "unvanquished": 32,
  "openarena": 16,
  "red-eclipse": 16,
  "warsow": 16,
  "sauerbraten": 32,
  "assaultcube-reloaded": 32,
  "bzflag": 32,
  "openttd": 255,
  "widelands": 8,
  "battle-for-wesnoth": 8,
};
