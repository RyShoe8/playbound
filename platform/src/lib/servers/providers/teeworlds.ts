import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

interface DdnetServerAddress {
  addresses?: string[];
  location?: string;
  info?: {
    max_clients?: number;
    max_players?: number;
    passworded?: boolean;
    game_type?: string;
    name?: string;
    map?: {
      name?: string;
    };
    clients?: Array<{ name?: string }>;
  };
}

interface DdnetResponse {
  servers?: DdnetServerAddress[];
}

function parseAddress(addr: string): { host: string; port: number } | null {
  // Format: tw-0.6+udp://1.2.3.4:8303 or udp://1.2.3.4:8303 or 1.2.3.4:8303
  const match = addr.match(/^(?:[a-zA-Z0-9.+_-]+:\/\/)?\[?([a-zA-Z0-9._-]+)\]?:(\d+)$/);
  if (!match) return null;
  const host = match[1];
  const port = parseInt(match[2], 10);
  if (!host || isNaN(port) || port <= 0 || port > 65535) return null;
  return { host, port };
}

export function parseTeeworldsServers(servers: DdnetServerAddress[]): GameServer[] {
  if (!Array.isArray(servers)) return [];
  const list: GameServer[] = [];

  for (const s of servers) {
    const info = s.info;
    if (!info || !info.name) continue;
    const addrs = s.addresses || [];
    const parsed = addrs.length > 0 ? parseAddress(addrs[0]) : null;
    if (!parsed) continue;

    const countryCode = s.location?.split(":")[1]?.toUpperCase() || null;
    const playerCount = Array.isArray(info.clients) ? info.clients.length : 0;
    const maxPlayers = info.max_players || info.max_clients || 16;
    const mapName = info.map?.name || "Standard";

    list.push({
      id: `${parsed.host}:${parsed.port}`,
      name: info.name.trim(),
      host: parsed.host,
      port: parsed.port,
      players: playerCount,
      maxPlayers,
      map: mapName,
      gameType: info.game_type || "dm",
      password: Boolean(info.passworded),
      country: countryCode,
    });
  }

  list.sort((a, b) => (b.players ?? 0) - (a.players ?? 0));
  return list.slice(0, MAX_SERVERS);
}

export async function fetchTeeworldsServers(): Promise<GameServer[]> {
  const urls = [
    "https://master1.ddnet.org/ddnet/15/servers.json",
    "https://master2.ddnet.org/ddnet/15/servers.json",
  ];

  let rawData: DdnetResponse | null = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
        next: { revalidate: 30 },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        rawData = (await res.json()) as DdnetResponse;
        break;
      }
    } catch {
      // try fallback mirror
    }
  }

  if (!rawData || !Array.isArray(rawData.servers)) {
    return [];
  }

  const parsed = parseTeeworldsServers(rawData.servers);
  return attachGeo(parsed);
}
