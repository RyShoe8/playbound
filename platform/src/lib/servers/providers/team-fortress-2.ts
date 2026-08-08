import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * Team Fortress 2 public servers via Steam Web API GetServerList.
 * Requires STEAM_WEB_API_KEY (Steam Web API key from steamcommunity.com/dev/apikey).
 */

const APP_ID = 440;
const STEAM_LIST_URL = "https://api.steampowered.com/IGameServersService/GetServerList/v1/";

export type SteamServerListRow = {
  addr?: string;
  gameport?: number;
  steamid?: string;
  name?: string;
  appid?: number;
  gamedir?: string;
  map?: string;
  secure?: boolean;
  dedicated?: boolean;
  players?: number;
  max_players?: number;
  bots?: number;
  /** 0 = public, 1 = private/password (Steam field naming varies). */
  gametype?: string;
};

let warnedMissingKey = false;

function steamApiKey(): string | null {
  const key = process.env.STEAM_WEB_API_KEY?.trim();
  return key || null;
}

/** Parse `host:port` / `[ipv6]:port` Steam addr strings. */
export function parseSteamAddr(addr: string | undefined): { host: string; port: number } | null {
  if (!addr || typeof addr !== "string") return null;
  const trimmed = addr.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    const m = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
    if (!m) return null;
    const port = Number(m[2]);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { host: m[1], port };
  }

  const idx = trimmed.lastIndexOf(":");
  if (idx <= 0) return null;
  const host = trimmed.slice(0, idx).trim();
  const port = Number(trimmed.slice(idx + 1));
  if (!host || !Number.isFinite(port) || port <= 0) return null;
  return { host, port };
}

/** Pure mapper for tests — no network / GeoIP. */
export function mapSteamServerListRows(rows: SteamServerListRow[]): GameServer[] {
  const mapped: GameServer[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const endpoint = parseSteamAddr(row.addr);
    if (!endpoint) continue;
    const id = `${endpoint.host}:${endpoint.port}`;
    if (seen.has(id)) continue;
    seen.add(id);
    mapped.push({
      id,
      name: (row.name && String(row.name).trim()) || id,
      host: endpoint.host,
      port: endpoint.port,
      players: row.players != null ? Number(row.players) : 0,
      maxPlayers: row.max_players != null ? Number(row.max_players) : null,
      map: row.map ? String(row.map) : null,
      gameType: row.gamedir || "tf",
      location: null,
      // Steam GetServerList does not always expose password; treat VAC-only as open.
      protected: false,
    });
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return mapped.slice(0, MAX_SERVERS);
}

export async function fetchTeamFortress2Servers(): Promise<GameServer[]> {
  const key = steamApiKey();
  if (!key) {
    if (!warnedMissingKey) {
      console.warn(
        "[servers] team-fortress-2: STEAM_WEB_API_KEY is not set — returning empty list"
      );
      warnedMissingKey = true;
    }
    return [];
  }

  const url = new URL(STEAM_LIST_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("filter", `\\appid\\${APP_ID}`);
  url.searchParams.set("limit", String(MAX_SERVERS));

  const res = await fetch(url.toString(), {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "application/json",
    },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Steam GetServerList returned ${res.status}`);
  }

  const data = (await res.json()) as {
    response?: { servers?: SteamServerListRow[] };
  };
  const rows = Array.isArray(data?.response?.servers) ? data.response.servers : [];
  const mapped = mapSteamServerListRows(rows);
  return attachGeo(mapped);
}
