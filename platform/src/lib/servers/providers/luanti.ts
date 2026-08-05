import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

type LuantiRow = {
  name?: string;
  address?: string;
  port?: number;
  clients?: number;
  clients_max?: number;
  gameid?: string;
  mapgen?: string;
  password?: boolean;
  geo_continent?: string;
  description?: string;
};

export async function fetchLuantiServers(): Promise<GameServer[]> {
  const res = await fetch("https://servers.luanti.org/list", {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Luanti list returned ${res.status}`);
  const data = (await res.json()) as { list?: LuantiRow[] };
  const rows = Array.isArray(data.list) ? data.list : [];

  const mapped: GameServer[] = [];
  for (const row of rows) {
    if (!row.address || !row.port || !row.name) continue;
    mapped.push({
      id: `${row.address}:${row.port}`,
      name: row.name,
      host: row.address,
      port: Number(row.port),
      players: Number(row.clients) || 0,
      maxPlayers: row.clients_max != null ? Number(row.clients_max) : null,
      map: row.mapgen || null,
      gameType: row.gameid || null,
      location: row.geo_continent
        ? { countryCode: "ZZ", region: String(row.geo_continent).toUpperCase() }
        : null,
      protected: Boolean(row.password),
    });
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
