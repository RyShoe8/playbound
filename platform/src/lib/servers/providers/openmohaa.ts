import { applyCountryCentroid } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * OpenMoHAA / Medal of Honor: Allied Assault public servers via 333networks.
 *
 * OpenMoHAA heartbeats under the classic GameSpy gamename `mohaa` (the
 * `openmohaa` JSON list is currently empty). The list endpoint already includes
 * hostname, map, ports, and player counts — do not scrape per-server detail
 * URLs (333networks ToS). Cache ≥ 8 minutes; they refresh about every 7.5
 * minutes and ban faster polling.
 *
 * Source: https://master.333networks.com/json/{gamename}?r=1000
 */

const REVALIDATE_SECONDS = 480;
const MASTER_BASE = "https://master.333networks.com/json";

type NetworksRow = {
  ip?: unknown;
  hostport?: unknown;
  hostname?: unknown;
  mapname?: unknown;
  gametype?: unknown;
  numplayers?: unknown;
  maxplayers?: unknown;
  country?: unknown;
  gamename?: unknown;
  gamever?: unknown;
};

type NetworksMeta = {
  players?: unknown;
  total?: unknown;
};

export type OpenMohaaListResult = {
  servers: GameServer[];
  /** Authoritative totals from the 333networks summary object when present. */
  players: number | null;
  serverCount: number | null;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize IPv4-mapped IPv6 (`::ffff:a.b.c.d`) and plain IPv4 hosts. */
export function normalizeMasterHost(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let host = raw.trim();
  if (!host) return null;
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) host = mapped[1];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return host;
  // Rare hostname-style rows — keep as-is when non-empty.
  if (!host.includes(" ") && host.length <= 253) return host;
  return null;
}

function finiteNonNegative(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function portFrom(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : null;
}

function locationFromCountryCode(raw: unknown): GameServer["location"] {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return applyCountryCentroid({ countryCode: code });
}

/**
 * Parse a 333networks JSON list payload: `[servers[], { players, total }]`.
 * Rows without an honest `numplayers` are omitted (unknown ≠ zero).
 */
export function parse333networksMohaaList(payload: unknown): OpenMohaaListResult {
  if (!Array.isArray(payload) || payload.length < 1) {
    throw new Error("333networks master returned a malformed payload");
  }

  const rows = payload[0];
  const meta = (payload[1] ?? {}) as NetworksMeta;
  if (!Array.isArray(rows)) {
    throw new Error("333networks master returned a non-array server list");
  }

  const servers: GameServer[] = [];
  for (const raw of rows as NetworksRow[]) {
    const host = normalizeMasterHost(raw.ip);
    const port = portFrom(raw.hostport);
    const players = finiteNonNegative(raw.numplayers);
    if (!host || port == null || players == null) continue;

    const hostname =
      typeof raw.hostname === "string" ? decodeEntities(raw.hostname) : "";
    const map =
      typeof raw.mapname === "string" && raw.mapname.trim()
        ? raw.mapname.trim()
        : null;
    const gameType =
      typeof raw.gametype === "string" && raw.gametype.trim()
        ? decodeEntities(raw.gametype)
        : "Medal of Honor Allied Assault";

    servers.push({
      id: `mohaa:${host}:${port}`,
      name: hostname || `${host}:${port}`,
      host,
      port,
      players,
      maxPlayers: finiteNonNegative(raw.maxplayers),
      map,
      gameType,
      location: locationFromCountryCode(raw.country),
      protected: false,
    });
  }

  servers.sort(
    (a, b) =>
      (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name)
  );

  const metaPlayers = finiteNonNegative(meta.players);
  const metaTotal = finiteNonNegative(meta.total);

  return {
    servers: servers.slice(0, MAX_SERVERS),
    players: metaPlayers,
    serverCount: metaTotal ?? (servers.length > 0 ? servers.length : null),
  };
}

async function fetchGamenameList(gamename: string): Promise<OpenMohaaListResult> {
  const url = `${MASTER_BASE}/${encodeURIComponent(gamename)}?r=1000`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PlayBound/1.0 (+https://playbound.com; credit 333networks)",
    },
    // 333networks updates ~every 7.5 minutes; faster polling risks bans.
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`333networks ${gamename} returned ${res.status}`);
  }
  return parse333networksMohaaList(await res.json());
}

/**
 * Prefer the OpenMoHAA-specific master name when it has servers; otherwise use
 * the shared `mohaa` list OpenMoHAA clients actually join.
 */
export async function fetchOpenMohaaList(): Promise<OpenMohaaListResult> {
  const preferred = await fetchGamenameList("openmohaa").catch(() => null);
  if (preferred && preferred.servers.length > 0) return preferred;

  return fetchGamenameList("mohaa");
}

export async function fetchOpenMohaaServers(): Promise<GameServer[]> {
  const result = await fetchOpenMohaaList();
  return result.servers;
}

export async function fetchOpenMohaaPlayerCount(): Promise<{
  players: number;
  servers: number;
}> {
  const result = await fetchOpenMohaaList();
  if (result.players == null || result.serverCount == null) {
    // Honest unknown: fall back to summing only rows we actually parsed.
    const players = result.servers.reduce(
      (sum, s) => sum + (Number(s.players) || 0),
      0
    );
    return { players, servers: result.servers.length };
  }
  return { players: result.players, servers: result.serverCount };
}
