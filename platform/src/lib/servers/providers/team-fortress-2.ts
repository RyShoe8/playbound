import type { GameServer } from "../types";
import { fetchSteamServerList } from "./steam-server-list";

/**
 * Team Fortress 2 public servers (Steam App 440).
 *
 * The Steam plumbing lives in steam-server-list.ts, shared with Counter-Strike
 * 2. Falls back to the live concurrent player count when the server list is
 * unavailable for any reason, rather than throwing — a refused key used to
 * surface here as an error instead of a smaller but true answer.
 */
export async function fetchTeamFortress2Servers(): Promise<GameServer[]> {
  return fetchSteamServerList({
    appId: 440,
    label: "Team Fortress 2",
    defaultGameDir: "tf",
    includeConcurrentTotal: true,
  });
}
