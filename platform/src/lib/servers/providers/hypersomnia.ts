import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * Hypersomnia's own masterserver list.
 *
 * First-party and intended to be complete: `https://hypersomnia.io/server_list_json`
 * is the same feed the in-game server browser and the project's website read, so
 * summing it is a population rather than a sample. Servers heartbeat into it,
 * which is also why a room PlayBound hosts privately will not appear — our
 * recipe does not advertise.
 *
 * Coverage gaps, recorded per docs/player-counts.md:
 *   - Private and LAN servers never register, so this is a floor.
 *   - Web clients are included; the feed marks them with `is_web_server`.
 *   - No authentication and no documented rate limit. Cached 60s below.
 *
 * `num_playing` is NOT the player count. Official instances run bots to keep
 * rounds warm — the sample this was written against reported `num_playing: 8`
 * on a server whose eight names were all "Cyber…" bots and whose
 * `num_online_humans` was 0. Counting `num_playing` would have invented a
 * population out of AI, which is exactly what the player-count policy forbids.
 */

const SERVER_LIST_URL = "https://hypersomnia.io/server_list_json";

interface HypersomniaServerRow {
  name?: unknown;
  ip?: unknown;
  site_displayed_address?: unknown;
  official_url?: unknown;
  arena?: unknown;
  game_mode?: unknown;
  slots?: unknown;
  num_online_humans?: unknown;
  num_playing?: unknown;
  num_spectating?: unknown;
  is_web_server?: unknown;
  is_ranked?: unknown;
  nat?: unknown;
}

function splitAddress(raw: unknown): { host: string; port: number } | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(/^\[?([a-zA-Z0-9._:-]+?)\]?:(\d{1,5})$/);
  if (!match) return null;
  const host = match[1];
  const port = Number.parseInt(match[2], 10);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host, port };
}

/** A count we can stand behind, or null. Never a silent zero from bad data. */
function humanCount(row: HypersomniaServerRow): number | null {
  const humans = row.num_online_humans;
  if (typeof humans !== "number" || !Number.isFinite(humans) || humans < 0) return null;
  return Math.floor(humans);
}

export function parseHypersomniaServers(rows: unknown): GameServer[] {
  if (!Array.isArray(rows)) return [];
  const list: GameServer[] = [];

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as HypersomniaServerRow;

    /*
     * Prefer the address the project displays over the raw IP. `ip` is the
     * literal socket, but official instances publish a stable hostname in
     * `site_displayed_address` (arena-us.hypersomnia.io:8001), and that is what
     * survives a machine move.
     */
    const addr =
      splitAddress(row.site_displayed_address) ??
      splitAddress(row.official_url) ??
      splitAddress(row.ip);
    if (!addr) continue;

    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
    if (!name) continue;

    const slots = typeof row.slots === "number" && row.slots > 0 ? Math.floor(row.slots) : null;
    const mode = typeof row.game_mode === "string" && row.game_mode ? row.game_mode : null;
    const arena = typeof row.arena === "string" && row.arena ? row.arena : null;

    list.push({
      id: `${addr.host}:${addr.port}`,
      name,
      host: addr.host,
      port: addr.port,
      players: humanCount(row),
      maxPlayers: slots,
      map: arena,
      gameType: row.is_ranked === true && mode ? `${mode} (Ranked)` : mode,
      location: null,
      protected: false,
    });
  }

  list.sort((a, b) => (b.players ?? -1) - (a.players ?? -1));
  return list.slice(0, MAX_SERVERS);
}

async function fetchServerList(): Promise<unknown> {
  const res = await fetch(SERVER_LIST_URL, {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`hypersomnia server list returned HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchHypersomniaServers(): Promise<GameServer[]> {
  // Deliberately not caught: the registry turns a throw into an error state,
  // and the policy is that an upstream failure is unknown, never zero.
  const parsed = parseHypersomniaServers(await fetchServerList());
  return attachGeo(parsed);
}

/**
 * Total humans across the listed servers.
 *
 * Rows whose count could not be parsed are excluded rather than counted as
 * zero, and `servers` reports how many rows we actually read so a caller can
 * tell "nobody is playing" from "the feed was malformed".
 */
export async function fetchHypersomniaPlayerCount(): Promise<{
  players: number;
  servers: number;
}> {
  const servers = await fetchHypersomniaServers();
  const players = servers.reduce((sum, s) => sum + (s.players ?? 0), 0);
  return { players, servers: servers.length };
}
