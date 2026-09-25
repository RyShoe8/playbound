import { queryManagedHostOccupancy } from "@/lib/gameHost/client";

export const QUERY_BY_GAME: Record<string, string> = {
  "counter-strike-2": "a2s-local",
  "hurry-curry": "hurry-curry-registry",
  "earth-2140-trilogy": "openra-master",
  "luanti": "luanti-master",
  "hypersomnia": "hypersomnia-master",
};

export function managedQueryKind(gameSlug: string, profile?: { queryVerified?: boolean; queryKind?: string } | null): string | null {
  if (profile?.queryVerified && profile.queryKind && profile.queryKind !== "none") return profile.queryKind;
  return QUERY_BY_GAME[gameSlug] || null;
}

export type ManagedOccupancy = { players: number; maxPlayers: number | null };

function validPlayers(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function validCapacity(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** A missing/failed registry entry is unknown, never zero players. */
export async function queryManagedOccupancy(input: {
  queryKind: string;
  host: string;
  port: number;
  communityServerId?: string;
  expectedMod?: string;
}): Promise<ManagedOccupancy | null> {
  if (input.queryKind === "a2s-local") {
    return input.communityServerId ? queryManagedHostOccupancy(input.communityServerId) : null;
  }
  if (input.queryKind === "luanti-master" || input.queryKind === "hypersomnia-master") {
    try {
      const luanti = input.queryKind === "luanti-master";
      const response = await fetch(luanti ? "https://servers.luanti.org/list" : "https://hypersomnia.io/server_list_json", {
        headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
        cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const payload = await response.json() as unknown;
      const rows = luanti && payload && typeof payload === "object" && "list" in payload ? payload.list : payload;
      if (!Array.isArray(rows)) return null;
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const entry = row as Record<string, unknown>;
        const address = luanti ? entry.address : entry.ip;
        const port = luanti ? Number(entry.port) : Number(String(address).split(":").at(-1));
        const host = luanti ? address : String(address).slice(0, -(String(port).length + 1));
        if (host !== input.host || port !== input.port) continue;
        const players = validPlayers(luanti ? entry.clients : entry.num_online_humans);
        return players === null ? null : { players, maxPlayers: validCapacity(luanti ? entry.clients_max : entry.slots) };
      }
      return null;
    } catch { return null; }
  }
  if (input.queryKind === "hurry-curry-registry") {
    try {
      const response = await fetch("https://registry.hurrycurry.org/v1/list", {
        headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
        cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const rows = await response.json() as unknown;
      if (!Array.isArray(rows)) return null;
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const entry = row as { address?: unknown; players_online?: unknown };
        if (!Array.isArray(entry.address)) continue;
        if (!entry.address.some((address) => {
          if (typeof address !== "string") return false;
          try { const url = new URL(address); return url.hostname === input.host && Number(url.port || (url.protocol === "wss:" ? 443 : 27032)) === input.port; }
          catch { return false; }
        })) continue;
        const players = validPlayers(entry.players_online);
        return players === null ? null : { players, maxPlayers: null };
      }
      return null;
    } catch { return null; }
  }
  if (input.queryKind !== "openra-master") return null;
  try {
    const response = await fetch("https://master.openra.net/games?protocol=2&type=json", {
      headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows = await response.json() as unknown;
    if (!Array.isArray(rows)) return null;
    const address = `${input.host}:${input.port}`;
    const match = rows.find((row) => row && typeof row === "object" && "address" in row && row.address === address &&
      (!input.expectedMod || ("mod" in row && row.mod === input.expectedMod))) as { players?: unknown; maxplayers?: unknown } | undefined;
    const players = validPlayers(match?.players);
    return players === null ? null : { players, maxPlayers: validCapacity(match?.maxplayers) };
  } catch {
    return null;
  }
}

export async function queryManagedPlayerCount(input: Parameters<typeof queryManagedOccupancy>[0]): Promise<number | null> {
  return (await queryManagedOccupancy(input))?.players ?? null;
}
