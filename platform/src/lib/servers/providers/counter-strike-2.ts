import type { GameServer } from "../types";
import { fetchSteamServerList } from "./steam-server-list";

/**
 * Counter-Strike 2 community servers (Steam App 730).
 *
 * This file used to ship a hand-written list of six servers with invented
 * player counts, maps and locations. It rendered as a live browser and never
 * changed, which is worse than showing nothing — a stale number a visitor can
 * disprove by clicking through costs more trust than an empty list. Everything
 * here now comes from Valve.
 *
 * CS2 keeps CS:GO's gamedir, so rows without one are labelled "csgo".
 */
export async function fetchCounterStrike2Servers(): Promise<GameServer[]> {
  return fetchSteamServerList({
    appId: 730,
    label: "Counter-Strike 2",
    defaultGameDir: "csgo",
    includeConcurrentTotal: true,
  });
}
