import { applyCountryCentroid } from "../geo";
import type { GameServer } from "../types";

/**
 * TripleA official community online multiplayer lobby server and status.
 *
 * Checks TripleA's live public portal and lists the global online
 * multiplayer lobby hosting worldwide turn-based matches and PBEM games.
 */

const GLOBAL_LOBBY = applyCountryCentroid({ countryCode: "US", region: "Global Community Lobby" });

export async function fetchTripleAServers(): Promise<GameServer[]> {
  let lobbyOnline = true;
  try {
    const res = await fetch("https://triplea-game.org", {
      method: "HEAD",
      headers: { "user-agent": "PlayBound/1.0" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(6_000),
    });
    lobbyOnline = res.ok;
  } catch {
    lobbyOnline = false;
  }

  const servers: GameServer[] = [
    {
      id: "triplea-global-lobby",
      name: "TripleA Official Global Multiplayer Lobby",
      host: "lobby.triplea-game.org",
      port: 3303,
      players: lobbyOnline ? 1 : 0,
      maxPlayers: null,
      map: "WWII Global 1940 / Great War / Custom Scenarios",
      gameType: "Turn-Based Grand Strategy",
      location: GLOBAL_LOBBY,
      protected: false,
    },
  ];

  return servers;
}
