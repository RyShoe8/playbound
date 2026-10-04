import { randomInt } from "node:crypto";

export const DECK_SIZE = 6;
export const BASE_TAPES = 5;
export const POOL_TAPES = 15;
export type Tape = { id: string; starter: boolean; enabled: boolean };
/** True once the launch catalog exists: five base tapes and fifteen others. */
export function catalogComplete(tracks: Tape[]): boolean {
  const base = tracks.filter(t => t.enabled && t.starter).length;
  const pool = tracks.filter(t => t.enabled && !t.starter).length;
  return base === BASE_TAPES && pool >= POOL_TAPES;
}
/** Decks hold six tapes, or every available tape while there are fewer. */
export function deckSize(available: number): number {
  return Math.max(1, Math.min(DECK_SIZE, available));
}
export function starterPack(tracks: Tape[], pick = randomInt): string[] {
  const base = tracks.filter(t => t.enabled && t.starter);
  const pool = tracks.filter(t => t.enabled && !t.starter);
  if (base.length !== 5 || pool.length < 15) throw new Error("Catalog needs five base tapes and at least fifteen other tapes");
  for (let i = pool.length - 1; i > 0; i--) {
    const j = pick(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [...base, ...pool.slice(0, 15)].map(t => t.id);
}
export function validateDeck(ids: unknown, owned: string[], active: string[]): string[] {
  const size = deckSize(active.filter(id => owned.includes(id)).length);
  if (!Array.isArray(ids) || ids.length !== size || new Set(ids).size !== size ||
      ids.some(id => typeof id !== "string" || !owned.includes(id) || !active.includes(id))) {
    throw new Error(size === DECK_SIZE ? "Choose six different, available tapes from your collection"
      : `Choose ${size} different, available tapes from your collection`);
  }
  return ids;
}
export function confirmedWinner(reports: Record<string, { winner: string; checksum: string }>, players: string[]): string | null {
  if (players.length !== 2 || players[0] === players[1]) return null;
  const a = reports[players[0]], b = reports[players[1]];
  return a && b && a.winner === b.winner && a.checksum === b.checksum && players.includes(a.winner) ? a.winner : null;
}
export function httpsUrl(value: unknown): string {
  if (!value) return "";
  const url = new URL(String(value));
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use a public HTTPS URL");
  return url.toString();
}
