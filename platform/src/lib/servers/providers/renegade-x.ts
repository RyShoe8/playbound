import type { GameServer } from "../types";

const MASTER_URL = "https://serverlist-rx.totemarts.services/servers.jsp";

type RenegadeXServer = {
  Name?: unknown;
  NamePrefix?: unknown;
  IP?: unknown;
  Port?: unknown;
  Players?: unknown;
  Bots?: unknown;
  "Current Map"?: unknown;
  "Game Version"?: unknown;
  Variables?: {
    "Player Limit"?: unknown;
    "Game Type"?: unknown;
    bPassworded?: unknown;
  };
};

function finiteNonNegative(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function parseRenegadeXServers(payload: unknown): GameServer[] {
  if (!Array.isArray(payload)) throw new Error("Renegade X master returned a non-array payload");

  return payload.flatMap((raw: RenegadeXServer) => {
    const host = typeof raw.IP === "string" ? raw.IP.trim() : "";
    const port = Number(raw.Port);
    const players = finiteNonNegative(raw.Players);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535 || players == null) {
      return [];
    }

    const prefix = typeof raw.NamePrefix === "string" ? raw.NamePrefix.trim() : "";
    const baseName = typeof raw.Name === "string" ? raw.Name.trim() : "";
    const name = [prefix, baseName].filter(Boolean).join(" ") || `${host}:${port}`;
    const maxPlayers = finiteNonNegative(raw.Variables?.["Player Limit"]);
    const map = typeof raw["Current Map"] === "string" ? raw["Current Map"] : null;
    const version = typeof raw["Game Version"] === "string" ? raw["Game Version"] : null;
    const gameType = finiteNonNegative(raw.Variables?.["Game Type"]);

    return [{
      id: `renegade-x:${host}:${port}`,
      name,
      host,
      port,
      players,
      maxPlayers,
      map,
      gameType: version
        ? `Renegade X · ${version}${gameType == null ? "" : ` · mode ${gameType}`}`
        : "Renegade X",
      location: null,
      protected: raw.Variables?.bPassworded === true,
    }];
  });
}

export async function fetchRenegadeXServers(): Promise<GameServer[]> {
  const response = await fetch(MASTER_URL, {
    headers: { accept: "application/json", "user-agent": "PlayBound/1.0" },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Renegade X master returned ${response.status}`);
  return parseRenegadeXServers(await response.json());
}
