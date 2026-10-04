import { randomInt } from "node:crypto";

export const DECK_SIZE = 6;
export type Tape = { id: string; starter: boolean; enabled: boolean };
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
  if (!Array.isArray(ids) || ids.length !== DECK_SIZE || new Set(ids).size !== DECK_SIZE ||
      ids.some(id => typeof id !== "string" || !owned.includes(id) || !active.includes(id))) {
    throw new Error("Choose six different, available tapes from your collection");
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
