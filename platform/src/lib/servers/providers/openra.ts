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
 * Fast aggregate player count query for live stats and card views.
 * Bypasses per-map YAML fetches and GeoIP queries to complete in ~2-3 seconds.
 */
export async function fetchOpenRaPlayerCount(): Promise<{ players: number; servers: number }> {
  const res = await fetch("https://master.openra.net/games?protocol=2&type=json", {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`OpenRA master returned ${res.status}`);
  const rows = (await res.json()) as OpenRaRow[];
  if (!Array.isArray(rows)) return { players: 0, servers: 0 };
  let players = 0;
  for (const row of rows) {
    players += Number(row.players) || 0;
  }
  return { players, servers: rows.length };
}

/**
 * Resolve OpenRA map UIDs to Resource Center titles (batch YAML).
 * Batches are processed in parallel with a safe timeout so slow/unreachable
 * maps never hang the server list.
 */
async function resolveMapTitles(hashes: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const unique = [...new Set(hashes.filter(Boolean))];
  const batchSize = 40;
  const batches: string[][] = [];

  for (let i = 0; i < unique.length; i += batchSize) {
    batches.push(unique.slice(i, i + batchSize));
  }

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const url = `https://resource.openra.net/map/hash/${batch.join(",")}/yaml`;
        const res = await fetch(url, {
          headers: { "user-agent": "PlayBound/1.0", accept: "text/yaml,*/*" },
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const text = await res.text();
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
    })
  );

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
      // Raw mod key ("ra"/"cnc"/"d2k"/...) for the join command — gameType
      // above is the display label and not always the same string.
      mod: row.mod || null,
      location: locationFromCountryName(row.location),
      protected: Boolean(row.protected),
    });
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  const capped = mapped.slice(0, MAX_SERVERS);

  const titlesPromise = resolveMapTitles(
    capped.map((s) => s.map).filter((m): m is string => Boolean(m))
  );
  const geoPromise = attachGeo(capped);

  const [titles, serversWithGeo] = await Promise.all([titlesPromise, geoPromise]);

  for (const server of serversWithGeo) {
    if (!server.map) continue;
    const key = server.map.toLowerCase();
    server.map = titles.get(key) || shortMapLabel(server.map);
  }

  return serversWithGeo;
}
