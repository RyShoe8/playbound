import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * OpenRCT2 advertised multiplayer parks from the public master API.
 * https://servers.openrct2.io/servers
 */

const SERVERS_URL = "https://servers.openrct2.io/servers";

type OpenRctAddress = {
  ip?: string;
  ipAddress?: string;
  port?: number;
};

type OpenRctServer = {
  name?: string;
  description?: string;
  version?: string;
  players?: number;
  maxPlayers?: number;
  requiresPassword?: boolean;
  passworded?: boolean;
  ip?: string;
  port?: number;
  addresses?: OpenRctAddress[];
  address?: OpenRctAddress | string;
};

function stripRctColors(text: string): string {
  // OpenRCT2 uses {COLOR} tags in names
  return String(text || "")
    .replace(/\{[A-Z0-9_]+\}/gi, "")
    .replace(/\{INLINE_SPRITE\}(?:\{\d+\})+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickHostPort(row: OpenRctServer): { host: string; port: number } | null {
  if (row.ip && row.port != null && Number(row.port) > 0) {
    return { host: String(row.ip), port: Number(row.port) };
  }
  const addrs = Array.isArray(row.addresses) ? row.addresses : [];
  for (const a of addrs) {
    const host = a.ip || a.ipAddress;
    const port = a.port != null ? Number(a.port) : NaN;
    if (host && Number.isFinite(port) && port > 0) return { host: String(host), port };
  }
  if (typeof row.address === "string" && /:\d+$/.test(row.address)) {
    const [host, portStr] = row.address.split(":");
    const port = Number(portStr);
    if (host && Number.isFinite(port) && port > 0) return { host, port };
  }
  if (row.address && typeof row.address === "object") {
    const host = row.address.ip || row.address.ipAddress;
    const port = row.address.port != null ? Number(row.address.port) : NaN;
    if (host && Number.isFinite(port) && port > 0) return { host: String(host), port };
  }
  return null;
}

function asServerList(data: unknown): OpenRctServer[] {
  if (Array.isArray(data)) return data as OpenRctServer[];
  if (data && typeof data === "object") {
    const obj = data as { servers?: unknown; Servers?: unknown };
    if (Array.isArray(obj.servers)) return obj.servers as OpenRctServer[];
    if (Array.isArray(obj.Servers)) return obj.Servers as OpenRctServer[];
  }
  return [];
}

export async function fetchOpenRct2Servers(): Promise<GameServer[]> {
  const res = await fetch(SERVERS_URL, {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "application/json, text/plain, */*",
    },
    next: { revalidate: 45 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenRCT2 servers API returned ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  let data: unknown = null;
  if (contentType.includes("json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("OpenRCT2 servers API returned invalid JSON");
    }
  } else {
    throw new Error("OpenRCT2 servers API did not return JSON");
  }

  const rows = asServerList(data);
  const mapped: GameServer[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const endpoint = pickHostPort(row);
    if (!endpoint) continue;
    const id = `${endpoint.host}:${endpoint.port}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = stripRctColors(row.name || "") || id;
    mapped.push({
      id,
      name,
      host: endpoint.host,
      port: endpoint.port,
      players: row.players != null ? Number(row.players) : 0,
      maxPlayers: row.maxPlayers != null ? Number(row.maxPlayers) : null,
      map: stripRctColors(row.description || "") || null,
      gameType: row.version || "OpenRCT2",
      location: null,
      protected: Boolean(row.requiresPassword ?? row.passworded),
    });
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
