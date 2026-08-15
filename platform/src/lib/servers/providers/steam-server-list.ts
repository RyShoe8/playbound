import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";
import { fetchSteamConcurrentPlayers } from "./steam-concurrent";

/**
 * Public server lists for Source games via Steam's GetServerList.
 *
 * Team Fortress 2 and Counter-Strike 2 answer the same call with the same row
 * shape and differ only in appid and the label used when gamedir is missing, so
 * the logic lives here rather than being copied per game. CS2 previously
 * imported this from the TF2 module, which had it depending on an unrelated
 * game for its plumbing.
 *
 * Needs STEAM_WEB_API_KEY. Every failure path — no key, a refused request, a
 * malformed body, an empty list — degrades to the live concurrent player count,
 * which comes from a public endpoint and needs no key. A real aggregate number
 * is a better answer than an error, and it is what most visitors came for.
 */

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

/**
 * Pure mapper for tests — no network / GeoIP.
 *
 * `defaultGameDir` is the label used when Steam omits gamedir on a row. It is a
 * parameter because every Source game reports its own ("tf", "csgo"), and the
 * response is otherwise identical across them.
 */
export function mapSteamServerListRows(
  rows: SteamServerListRow[],
  defaultGameDir = "tf"
): GameServer[] {
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
      gameType: row.gamedir || defaultGameDir,
      location: null,
      // Steam GetServerList does not always expose password; treat VAC-only as open.
      protected: false,
    });
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return mapped.slice(0, MAX_SERVERS);
}

export async function fetchSteamServerList(opts: {
  appId: number;
  label: string;
  defaultGameDir: string;
  /**
   * Prepend the platform-wide concurrent count to the server list.
   *
   * GetServerList enumerates community servers only, and for these games that
   * is a rounding error against the real population — CS2 was showing 609
   * players from its community list while 944,507 were in Valve matchmaking,
   * and TF2 140 against 57,854. Reporting only the list makes a game with a
   * million players look dead.
   *
   * The two overlap slightly, since the concurrent figure includes the people
   * on those community servers. At 0.06% of the total it is not worth the
   * arithmetic, and it could not be done accurately anyway: the list is capped
   * at MAX_SERVERS, so we never see every community server to subtract.
   */
  includeConcurrentTotal?: boolean;
}): Promise<GameServer[]> {
  const { appId, label, defaultGameDir, includeConcurrentTotal } = opts;
  const concurrent = () => fetchSteamConcurrentPlayers(appId, { label });

  const key = steamApiKey();
  if (!key) return concurrent();

  const url = new URL(STEAM_LIST_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("filter", `\\appid\\${appId}`);
  url.searchParams.set("limit", String(MAX_SERVERS));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "user-agent": "PlayBound/1.0",
        accept: "application/json",
      },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(15_000),
    });
    // 403 is what a missing, expired or unentitled key returns.
    if (!res.ok) throw new Error(`Steam GetServerList returned ${res.status}`);

    const data = (await res.json()) as {
      response?: { servers?: SteamServerListRow[] };
    };
    const rows = Array.isArray(data?.response?.servers) ? data.response.servers : [];
    if (rows.length === 0) return concurrent();

    const servers = await attachGeo(mapSteamServerListRows(rows, defaultGameDir));
    if (!includeConcurrentTotal) return servers;
    // Total first, community servers under it.
    return [...(await concurrent()), ...servers];
  } catch (err) {
    console.warn(
      `[servers] ${label}: server list unavailable, using concurrent count —`,
      err instanceof Error ? err.message : err
    );
    return concurrent();
  }
}
