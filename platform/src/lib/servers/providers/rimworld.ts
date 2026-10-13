import { fetchRimworldBrowser } from "@/lib/gameHost/client";
import type { GameServer } from "../types";

export function normalizeRimworldServers(rows: unknown[]): GameServer[] {
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    if (row.isPrivate || typeof row.host !== "string" || !row.host || /[\s/\\]/.test(row.host) || typeof row.port !== "number" || !Number.isInteger(row.port) || row.port < 1 || row.port > 65535) return [];
    const count = (n: unknown, min: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n < 100000 ? n : null;
    return [{ id: `rimworld:${row.host}:${row.port}`, gameSlug: "rimworld", editionSlug: "rimworld-together", name: typeof row.name === "string" ? row.name : "RimWorld Together", host: row.host, port: row.port, players: count(row.players, 0), maxPlayers: count(row.maxPlayers, 1), bots: 0, map: null, gameType: "RimWorld Together", mod: "rimworld-together", location: null, protected: row.passwordProtected === true }];
  });
}

export async function fetchRimworldServers(): Promise<GameServer[]> {
  return normalizeRimworldServers(await fetchRimworldBrowser());
}
