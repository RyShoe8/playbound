import { attachGeo, locationFromCountryName } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

export async function fetchWarzone2100Servers(): Promise<GameServer[]> {
  const res = await fetch("https://wzlobby.wz2100.net/api/v1/games", {
    headers: {
      "User-Agent": "Warzone2100/4.7.0",
      Origin: "wz2100://wz2100.net",
      Referer: "https://github.com/Warzone2100/warzone2100?wz_internal=list",
      Accept: "application/jsonl",
    },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Warzone 2100 API returned ${res.status}`);
  }

  const text = await res.text();
  const lines = text.split("\n").filter(Boolean);
  const mapped: GameServer[] = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.action === "list_header") continue;
      
      const details = obj.details || {};
      
      mapped.push({
        id: obj.id || `${obj.host}:${obj.port}`,
        name: obj.name || "Warzone 2100 Game",
        host: obj.host,
        port: Number(obj.port),
        players: Array.isArray(obj.players) ? obj.players.length : 0,
        maxPlayers: obj.maxPlayers ? Number(obj.maxPlayers) : 8,
        map: details.map || null,
        gameType: details.gameType || null,
        location: null, // No location info typically provided directly
        protected: Boolean(obj.hasPassword),
      });
    } catch (e) {
      // Ignore JSON parse errors for malformed lines
    }
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
