import { MAX_SERVERS } from "./types.js";

const LOBBY = "wzlobby.wz2100.net";
const GAMES_URL = `https://${LOBBY}/api/v1/games`;

/**
 * Warzone 2100 netlobby list (JSON Lines). IPs are often omitted; GameId used as host.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollWarzone() {
  try {
    const res = await fetch(GAMES_URL, {
      headers: {
        "user-agent": "Warzone2100/Git-master (PlayBound)",
        accept: "application/jsonl",
        origin: "wz2100://wz2100.net",
        referer: "https://github.com/Warzone2100/warzone2100?wz_internal=list",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Warzone lobby returned ${res.status}`);
    }
    const text = await res.text();
    const servers = parseJsonl(text);
    if (servers.length) return servers.slice(0, MAX_SERVERS);
  } catch (err) {
    // Cloudflare often blocks datacenter scrapers — fall through to pointer row
    console.warn("[warzone]", err instanceof Error ? err.message : err);
  }

  return [
    {
      id: "warzone:lobby",
      name: "Warzone 2100 Net Lobby",
      host: LOBBY,
      port: 2100,
      players: 0,
      maxPlayers: null,
      map: null,
      gameType: "warzone-lobby",
      location: null,
      protected: false,
    },
  ];
}

/**
 * @param {string} text
 * @returns {import('./types.js').GameServer[]}
 */
function parseJsonl(text) {
  /** @type {import('./types.js').GameServer[]} */
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    // Skip header-only objects
    const gameId = obj.gameId || obj.gid || obj.id;
    const name = obj.name || obj.title || obj.description || (gameId ? `Game ${gameId}` : null);
    if (!name) continue;

    const players =
      typeof obj.players === "number"
        ? obj.players
        : typeof obj.players?.current === "number"
          ? obj.players.current
          : Number(obj.playerCount) || 0;
    const maxPlayers =
      typeof obj.maxPlayers === "number"
        ? obj.maxPlayers
        : typeof obj.players?.max === "number"
          ? obj.players.max
          : null;

    const host =
      obj.host ||
      obj.hostIP ||
      obj.ip ||
      (Array.isArray(obj.connections) && obj.connections[0]?.host) ||
      (gameId ? String(gameId) : null);
    const port =
      Number(obj.port) ||
      Number(obj.hostPort) ||
      Number(Array.isArray(obj.connections) && obj.connections[0]?.port) ||
      2100;

    if (!host) continue;

    out.push({
      id: String(gameId || `${host}:${port}`),
      name: String(name),
      host: String(host),
      port,
      players,
      maxPlayers,
      map: obj.map || obj.mapName || null,
      gameType: obj.mod || obj.gameType || "warzone",
      location: null,
      protected: Boolean(obj.passworded || obj.private),
    });
  }
  out.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  return out;
}
