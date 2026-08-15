import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

type SS14Server = {
  address?: string;
  statusData?: {
    name?: string;
    players?: number;
    soft_max_players?: number;
    tags?: string[];
    round_start_time?: string;
    map?: string;
    preset?: string;
  };
};

export async function fetchSpaceStation14Servers(): Promise<GameServer[]> {
  const res = await fetch("https://hub.spacestation14.com/api/servers", {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SS14 hub API returned ${res.status}`);
  const rows = (await res.json()) as SS14Server[];
  if (!Array.isArray(rows)) return [];

  const mapped: GameServer[] = [];
  for (const row of rows) {
    const status = row.statusData;
    if (!status?.name || !row.address) continue;

    // Address format: ss14://host:port or ss14s://host:port or http://...
    let host = row.address;
    let port = 1212;
    try {
      const parsed = new URL(row.address.replace(/^ss14s?:\/\//, "http://"));
      host = parsed.hostname;
      port = parsed.port ? Number(parsed.port) : 1212;
    } catch {
      // Fallback to address string
    }

    const players = Number(status.players ?? 0);
    const maxPlayers = status.soft_max_players != null ? Number(status.soft_max_players) : null;
    const tags = Array.isArray(status.tags) ? status.tags : [];
    const gameType = tags.slice(0, 3).join(", ") || status.preset || null;

    mapped.push({
      id: row.address,
      name: status.name,
      host,
      port,
      players,
      maxPlayers,
      map: status.map || null,
      gameType,
      location: null,
      protected: false,
    });
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
