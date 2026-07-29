import { attachGeo, locationFromCountryName } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

type BarBattle = {
  battleId?: number | string;
  title?: string;
  ip?: string;
  port?: number;
  map?: string;
  maxPlayers?: number;
  passworded?: boolean;
  locked?: boolean;
  gameType?: string;
  preset?: string;
  gameStatus?: string;
  players?: unknown[];
  founder?: { country?: string };
};

export async function fetchBeyondAllReasonServers(): Promise<GameServer[]> {
  const res = await fetch("https://api.bar-rts.com/battles", {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`BAR battles API returned ${res.status}`);
  const rows = (await res.json()) as BarBattle[];
  if (!Array.isArray(rows)) return [];

  const mapped: GameServer[] = [];
  for (const row of rows) {
    if (!row.ip || !row.port || !row.title) continue;
    if (row.locked) continue;
    const players = Array.isArray(row.players) ? row.players.length : 0;
    mapped.push({
      id: String(row.battleId ?? `${row.ip}:${row.port}`),
      name: row.title,
      host: row.ip,
      port: Number(row.port),
      players,
      maxPlayers: row.maxPlayers != null ? Number(row.maxPlayers) : null,
      map: row.map || null,
      gameType: row.gameType || row.preset || row.gameStatus || null,
      location: locationFromCountryName(row.founder?.country),
      protected: Boolean(row.passworded),
    });
  }

  mapped.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
