import { MAX_SERVERS } from "./types.js";

const TES3MP_MASTER_URL = "http://master.tes3mp.com:8081/api/servers";

/**
 * Clean up extra quotes or whitespace from community-submitted hostnames.
 * @param {string} raw
 * @param {string} fallback
 */
function cleanHostname(raw, fallback) {
  if (!raw) return fallback;
  let name = String(raw).trim();
  // Strip outer quotes if double quoted
  while (name.startsWith('"') && name.endsWith('"') && name.length > 1) {
    name = name.slice(1, -1).trim();
  }
  return name || fallback;
}

/**
 * Resiliently parse TES3MP server dictionary.
 * Server operators occasionally enter hostnames with unescaped quotes in their config files,
 * causing raw JSON syntax errors (e.g. `"hostname": ""NotSedso""`).
 * @param {string} text
 * @returns {Array<{ host: string, port: number, name: string, players: number, maxPlayers: number | null, map: string | null, gameType: string, protected: boolean }>}
 */
export function parseTes3mpServers(text) {
  // Strategy 1: Try JSON.parse after fixing common unescaped double quote patterns
  try {
    const sanitized = text.replace(/"hostname"\s*:\s*""(.*?)""/g, '"hostname": "$1"');
    const data = JSON.parse(sanitized);
    const list = data["list servers"];
    if (list && typeof list === "object") {
      const parsed = [];
      for (const [addr, s] of Object.entries(list)) {
        if (!addr || !s) continue;
        const [host, portStr] = addr.split(":");
        const port = Number(portStr);
        if (!host || !Number.isFinite(port)) continue;

        const name = cleanHostname(s.hostname, addr);
        const players = Number(s.players) || 0;
        const maxPlayers = Number(s.max_players) || null;
        const map = s.modname && s.modname !== "Default" ? String(s.modname) : null;
        const gameType = s.version ? `TES3MP ${s.version}` : "TES3MP";
        const isProtected = Boolean(s.passw);

        parsed.push({
          host,
          port,
          name,
          players,
          maxPlayers,
          map,
          gameType,
          protected: isProtected,
        });
      }
      return parsed;
    }
  } catch (err) {
    console.warn("[tes3mp] JSON parse error, using regex fallback:", err instanceof Error ? err.message : err);
  }

  // Strategy 2: Regex extraction fallback for resilient parsing
  const fallbackList = [];
  const serverRegex = /"(\d{1,3}(?:\.\d{1,3}){3}):(\d+)":\s*\{([^}]+)\}/g;
  let match;
  while ((match = serverRegex.exec(text)) !== null) {
    const host = match[1];
    const port = Number(match[2]);
    const body = match[3];

    const getField = (name) => {
      const m = body.match(new RegExp(`"${name}"\\s*:\\s*(?:"([^"]*)"|""([^"]*)""|([^,]+))`));
      if (!m) return null;
      return m[1] ?? m[2] ?? m[3]?.trim();
    };

    const rawHostname = getField("hostname");
    const name = cleanHostname(rawHostname, `${host}:${port}`);
    const players = Number(getField("players")) || 0;
    const maxPlayers = Number(getField("max_players")) || null;
    const passw = getField("passw") === "true";
    const modname = getField("modname");
    const version = getField("version");

    fallbackList.push({
      host,
      port,
      name,
      players,
      maxPlayers,
      map: modname && modname !== "Default" ? modname : null,
      gameType: version ? `TES3MP ${version}` : "TES3MP",
      protected: passw,
    });
  }

  return fallbackList;
}

let cachedServers = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30_000;

/**
 * Polls the TES3MP Master Server for Morrowind / TES3MP servers.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollTes3mp() {
  const now = Date.now();
  if (cachedServers && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedServers;
  }

  const res = await fetch(TES3MP_MASTER_URL, {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "application/json, text/plain",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`TES3MP master server returned ${res.status}`);
  }

  const text = await res.text();
  const rawList = parseTes3mpServers(text);

  /** @type {import('./types.js').GameServer[]} */
  const servers = rawList.map((s) => ({
    id: `tes3mp:${s.host}:${s.port}`,
    name: s.name,
    host: s.host,
    port: s.port,
    players: s.players,
    maxPlayers: s.maxPlayers,
    map: s.map,
    gameType: s.gameType,
    location: null,
    protected: s.protected,
  }));

  // Sort descending by players, then by name
  servers.sort((a, b) => (b.players || 0) - (a.players || 0) || a.name.localeCompare(b.name));

  const result = servers.slice(0, MAX_SERVERS);
  cachedServers = result;
  lastFetchTime = now;
  return result;
}
