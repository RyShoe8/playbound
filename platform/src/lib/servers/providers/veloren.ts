import { attachGeo, locationFromCountryName } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

type VelorenRow = {
  name?: string;
  address?: string;
  port?: number;
  description?: string;
  location?: string;
  query_port?: number;
  channel?: string;
  official?: boolean;
};

export async function fetchVelorenServers(): Promise<GameServer[]> {
  const res = await fetch("https://serverlist.veloren.net/v1/servers", {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Veloren serverlist returned ${res.status}`);
  const data = (await res.json()) as { servers?: VelorenRow[] };
  const rows = Array.isArray(data.servers) ? data.servers : [];

  const mapped: GameServer[] = [];
  for (const row of rows) {
    if (!row.address || !row.name || !row.port) continue;
    mapped.push({
      id: `${row.address}:${row.port}`,
      name: row.name,
      host: row.address,
      port: Number(row.port),
      players: 0,
      maxPlayers: null,
      map: null,
      gameType: row.channel || (row.official ? "official" : null),
      location: locationFromCountryName(row.location),
      protected: false,
    });
  }

  mapped.sort((a, b) => a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
