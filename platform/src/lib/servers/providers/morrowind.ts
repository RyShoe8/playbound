import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

const TES3MP_MASTER_URL = "http://master.tes3mp.com:8081/api/servers";

function cleanHostname(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;
  let name = raw.trim();
  while (name.startsWith('"') && name.endsWith('"') && name.length > 1) {
    name = name.slice(1, -1).trim();
  }
  return name || fallback;
}

export function parseTes3mpServers(text: string): GameServer[] {
  // Strategy 1: Try JSON.parse after fixing common unescaped double quote patterns
  try {
    const sanitized = text.replace(/"hostname"\s*:\s*""(.*?)""/g, '"hostname": "$1"');
    const data = JSON.parse(sanitized) as { "list servers"?: Record<string, Record<string, unknown>> };
    const list = data["list servers"];
    if (list && typeof list === "object") {
      const parsed: GameServer[] = [];
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
          id: `tes3mp:${host}:${port}`,
          name,
          host,
          port,
          players,
          maxPlayers,
          map,
          gameType,
          location: null,
          protected: isProtected,
        });
      }
      return parsed;
    }
  } catch {
    // Fall through to regex extraction
  }

  // Strategy 2: Regex extraction fallback for resilient parsing
  const fallbackList: GameServer[] = [];
  const serverRegex = /"(\d{1,3}(?:\.\d{1,3}){3}):(\d+)":\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = serverRegex.exec(text)) !== null) {
    const host = match[1];
    const port = Number(match[2]);
    const body = match[3];

    const getField = (name: string): string | null => {
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
      id: `tes3mp:${host}:${port}`,
      name,
      host,
      port,
      players,
      maxPlayers,
      map: modname && modname !== "Default" ? modname : null,
      gameType: version ? `TES3MP ${version}` : "TES3MP",
      location: null,
      protected: passw,
    });
  }

  return fallbackList;
}

/**
 * Direct fallback fetcher for Morrowind / TES3MP servers.
 * Queries the official TES3MP HTTP master server.
 */
export async function fetchMorrowindServers(): Promise<GameServer[]> {
  const res = await fetch(TES3MP_MASTER_URL, {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "application/json, text/plain",
    },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`TES3MP master server returned ${res.status}`);
  }

  const text = await res.text();
  const servers = parseTes3mpServers(text);

  // Sort descending by players, then by name
  servers.sort((a, b) => (b.players || 0) - (a.players || 0) || a.name.localeCompare(b.name));

  return attachGeo(servers.slice(0, MAX_SERVERS));
}
