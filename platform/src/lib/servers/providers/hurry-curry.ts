import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * Hurry Curry! public server list.
 *
 * The game ships a first-party registry: every server started with
 * `--register` announces itself to https://registry.hurrycurry.org (the
 * default "global" registry), and `GET /v1/list` returns the current set as
 * JSON. `players_online` is the server's own live count, which is exactly the
 * population figure — not a proxy — so it satisfies the honest-source rule in
 * docs/player-counts.md.
 *
 * Response rows look like:
 *   { "name": "meta's public server",
 *     "address": ["wss://hurrycurry.metamuffin.org:443"],
 *     "players_online": 0, "last_game": 0, "version": [13, 0] }
 */

type HurryCurryRow = {
  name?: string;
  /** One or more ws:// or wss:// URLs. A server may advertise several. */
  address?: string[];
  players_online?: number;
  last_game?: number;
  version?: [number, number];
};

const REGISTRY_LIST_URL = "https://registry.hurrycurry.org/v1/list";

/**
 * Split a `ws(s)://host:port` announcement into host and port.
 *
 * Port is explicit in every row the registry currently serves, but the scheme
 * default is the correct fallback: wss is TLS on 443, plain ws is the game
 * server's own 27032 (see protocol.md "Ports").
 */
function parseAddress(raw: string): { host: string; port: number; secure: boolean } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
    const secure = url.protocol === "wss:";
    const port = url.port ? Number(url.port) : secure ? 443 : 27032;
    if (!url.hostname || !Number.isFinite(port)) return null;
    return { host: url.hostname, port, secure };
  } catch {
    return null;
  }
}

export async function fetchHurryCurryServers(): Promise<GameServer[]> {
  const res = await fetch(REGISTRY_LIST_URL, {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Hurry Curry registry returned ${res.status}`);

  const rows = (await res.json()) as HurryCurryRow[];
  if (!Array.isArray(rows)) return [];

  const mapped: GameServer[] = [];
  for (const row of rows) {
    const announced = Array.isArray(row.address) ? row.address : [];
    /*
     * Prefer the TLS address when a server advertises both. A browser client
     * on https cannot open a plain ws:// socket, so the wss row is the one
     * that actually works from the web build.
     */
    const parsed = announced
      .map(parseAddress)
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) => Number(b.secure) - Number(a.secure))[0];
    if (!parsed || !row.name) continue;

    mapped.push({
      id: `${parsed.host}:${parsed.port}`,
      name: row.name,
      host: parsed.host,
      port: parsed.port,
      /*
       * The registry reports players_online per server. Absent is unknown,
       * not zero — a row that omits it must not read as an empty server.
       */
      players: typeof row.players_online === "number" ? row.players_online : null,
      // The protocol exposes no lobby cap, so max is genuinely unknown.
      maxPlayers: null,
      map: null,
      gameType: Array.isArray(row.version) ? `v${row.version.join(".")}` : null,
      location: null,
      protected: false,
    });
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
