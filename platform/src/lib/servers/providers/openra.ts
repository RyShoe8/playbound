import { attachGeo, locationFromCountryName } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

type OpenRaRow = {
  id?: number | string;
  name?: string;
  address?: string;
  players?: number;
  maxplayers?: number;
  map?: string;
  mod?: string;
  modtitle?: string;
  protected?: boolean;
  location?: string;
};

function parseAddress(address: string): { host: string; port: number } | null {
  const idx = address.lastIndexOf(":");
  if (idx <= 0) return null;
  const host = address.slice(0, idx);
  const port = Number(address.slice(idx + 1));
  if (!host || !Number.isFinite(port)) return null;
  return { host, port };
}

export async function fetchOpenRaServers(): Promise<GameServer[]> {
  const res = await fetch("https://master.openra.net/games?protocol=2&type=json", {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`OpenRA master returned ${res.status}`);
  const rows = (await res.json()) as OpenRaRow[];
  if (!Array.isArray(rows)) return [];

  const mapped: GameServer[] = [];
  for (const row of rows) {
    if (!row.address || !row.name) continue;
    const parsed = parseAddress(row.address);
    if (!parsed) continue;
    mapped.push({
      id: String(row.id ?? row.address),
      name: row.name,
      host: parsed.host,
      port: parsed.port,
      players: Number(row.players) || 0,
      maxPlayers: row.maxplayers != null ? Number(row.maxplayers) : null,
      map: row.map || null,
      gameType: row.modtitle || row.mod || null,
      location: locationFromCountryName(row.location),
      protected: Boolean(row.protected),
    });
  }

  mapped.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  const capped = mapped.slice(0, MAX_SERVERS);
  return attachGeo(capped);
}
