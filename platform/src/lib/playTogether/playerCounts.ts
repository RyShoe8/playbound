export type GamePlayerCount = {
  /** Smallest useful session. */
  min: number;
  /** Largest supported game session; null means an MMO/shared world. */
  max: number | null;
  /** Sensible PlayBound party cap, which may be smaller than the whole server. */
  partyMax: number;
  note?: string;
};

/**
 * Verified player limits for catalog games whose party size is not the old
 * one-size-fits-all default of eight.  Keep this about playable sessions, not
 * store marketing: Apex has 60 people in a match but a three-person squad,
 * while Fishing Planet's shared yacht is the useful five-person party cap.
 */
export const GAME_PLAYER_COUNTS: Readonly<Record<string, GamePlayerCount>> = Object.freeze({
  "goldeneye-source": { min: 2, max: 16, partyMax: 16 },
  "volleyball-legends": { min: 1, max: 12, partyMax: 12, note: "Six-versus-six Roblox servers." },
  "c-dogs-retrarch": { min: 1, max: 4, partyMax: 4 },
  "sven-co-op": { min: 1, max: 32, partyMax: 12, note: "Servers support 32; most maps play best with twelve or fewer." },
  teeworlds: { min: 2, max: 16, partyMax: 16 },
  assaultcube: { min: 1, max: 16, partyMax: 16 },
  bzflag: { min: 1, max: 200, partyMax: 16, note: "Server limits are configurable; sixteen keeps private matches readable." },
  openclonk: { min: 1, max: 16, partyMax: 16, note: "The scenario decides the final player limit." },
  "red-eclipse": { min: 1, max: 32, partyMax: 20, note: "PlayBound parties cap at twenty." },
  widelands: { min: 1, max: 8, partyMax: 8, note: "The selected map determines available player slots." },
  warfork: { min: 1, max: 16, partyMax: 16 },
  "slapshot-rebound": { min: 1, max: 12, partyMax: 12, note: "Standard matchmaking is three-versus-three; custom games support twelve." },
  deadeus: { min: 1, max: 1, partyMax: 1 },
  openspades: { min: 2, max: 32, partyMax: 20, note: "PlayBound parties cap at twenty." },
  "opentyrian-2000": { min: 1, max: 2, partyMax: 2 },
  "pokemon-dawn-of-darkness": { min: 1, max: null, partyMax: 20, note: "Persistent MMO world; PlayBound parties cap at twenty." },
  gradius: { min: 1, max: 1, partyMax: 1 },
  "metal-slug-remake": { min: 1, max: 1, partyMax: 1 },
  mekorama: { min: 1, max: 1, partyMax: 1 },
  "ye-guild-clerk": { min: 1, max: 1, partyMax: 1 },
  poco: { min: 1, max: 1, partyMax: 1 },
  "data-wing": { min: 1, max: 1, partyMax: 1 },
  "the-spike-cross": { min: 1, max: 2, partyMax: 2 },
  "panzer-marshal": { min: 1, max: 2, partyMax: 2, note: "Local pass-and-play." },
  hearthstone: { min: 1, max: 8, partyMax: 2, note: "Most modes are one-versus-one; Battlegrounds has eight." },
  "apex-legends": { min: 2, max: 60, partyMax: 3, note: "Three-player squad party." },
  "among-us": { min: 4, max: 15, partyMax: 15 },
  "idle-slayer": { min: 1, max: 1, partyMax: 1 },
  "goose-goose-duck": { min: 5, max: 16, partyMax: 16 },
  trackmania: { min: 1, max: 200, partyMax: 20, note: "PlayBound parties cap at twenty even when a room is larger." },
  "poppy-playtime": { min: 1, max: 1, partyMax: 1 },
  "fishing-planet": { min: 1, max: 5, partyMax: 5, note: "Shared ocean yachts hold up to five friends." },
  "sky-children-of-the-light": { min: 1, max: 8, partyMax: 8 },
  ryzom: { min: 1, max: null, partyMax: 20, note: "Persistent MMO world; PlayBound parties cap at twenty." },
  wolfenstein: { min: 1, max: 11, partyMax: 11, note: "ECWolf LAN nodes." },
  bombsquad: { min: 1, max: 8, partyMax: 8 },
  "populous-reincarnated": { min: 1, max: 4, partyMax: 4 },
  "lincity-ng": { min: 1, max: 1, partyMax: 1 },
  "3d-city": { min: 1, max: 1, partyMax: 1 },
  isocity: { min: 1, max: 1, partyMax: 1 },
});

export function gamePlayerCount(slug: string | null | undefined): GamePlayerCount | null {
  return slug ? GAME_PLAYER_COUNTS[slug] || null : null;
}

export function defaultPartySize(slug: string | null | undefined): number {
  return gamePlayerCount(slug)?.partyMax || 8;
}
