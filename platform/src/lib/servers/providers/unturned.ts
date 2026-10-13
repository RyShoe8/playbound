import { fetchSteamServerList } from "./steam-server-list";
import { fetchSteamConcurrentPlayers } from "./steam-concurrent";

/** Steam's official master list, cached for 60 seconds. Requires the existing
 * STEAM_WEB_API_KEY. The capped list is not the game's total population.
 * Unturned's Connect menu uses the configured query port (the first of its
 * two UDP ports), matching Steam addr and our dedicated recipe's Port value.
 */
export function fetchUnturnedServers() {
  return fetchSteamServerList({ appId: 304930, label: "Unturned", defaultGameDir: "unturned", serverListOnly: true });
}

/** Steam concurrency includes private/LAN sessions. Never add it to server
 * occupancy, and never turn it into a joinable fake server row. */
export async function fetchUnturnedPlayerCount() {
  const rows = await fetchSteamConcurrentPlayers(304930, { label: "Unturned" });
  if (!rows.length || rows[0].players == null) throw new Error("Unturned Steam player count unavailable");
  return { players: rows[0].players, servers: 0 };
}
