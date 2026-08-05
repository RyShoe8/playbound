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

function shortMapLabel(hash: string): string {
  return hash.length > 12 ? `Map ${hash.slice(0, 8)}` : hash;
}

/**
 * Resolve OpenRA map UIDs to Resource Center titles (batch YAML).
 * Unknown / official bundled maps stay as short labels.
 */
async function resolveMapTitles(hashes: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const unique = [...new Set(hashes.filter(Boolean))];
  const batchSize = 40;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    try {
      const url = `https://resource.openra.net/map/hash/${batch.join(",")}/yaml`;
      const res = await fetch(url, {
        headers: { "user-agent": "PlayBound/1.0", accept: "text/yaml,*/*" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      // Format:
      // <hash>:
      // 	title: Some Map
      let current: string | null = null;
      for (const line of text.split(/\r?\n/)) {
        const header = line.match(/^([0-9a-f]{40})\s*:\s*$/i);
        if (header) {
          current = header[1].toLowerCase();
          continue;
        }
        if (!current) continue;
        const title = line.match(/^\s+title:\s*(.+)\s*$/i);
        if (title) {
          const value = title[1].trim().replace(/^["']|["']$/g, "");
          if (value) titles.set(current, value);
          current = null;
        }
      }
    } catch {
      // Fail soft — leave unresolved hashes for short labels
    }
  }

  return titles;
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

  const titles = await resolveMapTitles(
    capped.map((s) => s.map).filter((m): m is string => Boolean(m))
  );
  for (const server of capped) {
    if (!server.map) continue;
    const key = server.map.toLowerCase();
    server.map = titles.get(key) || shortMapLabel(server.map);
  }

  return attachGeo(capped);
}
