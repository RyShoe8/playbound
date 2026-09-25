import { queryManagedHostPlayers } from "@/lib/gameHost/client";

/** A missing/failed registry entry is unknown, never zero players. */
export async function queryManagedPlayerCount(input: {
  queryKind: string;
  host: string;
  port: number;
  communityServerId?: string;
  expectedMod?: string;
}): Promise<number | null> {
  if (input.queryKind === "a2s-local") {
    return input.communityServerId ? queryManagedHostPlayers(input.communityServerId) : null;
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
        const count = entry.players_online;
        return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null;
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
      (!input.expectedMod || ("mod" in row && row.mod === input.expectedMod))) as { players?: unknown } | undefined;
    const count = match?.players;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    return count;
  } catch {
    return null;
  }
}
