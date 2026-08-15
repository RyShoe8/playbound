/**
 * Steam concurrent player count via ISteamUserStats/GetNumberOfCurrentPlayers.
 *
 * Used for closed MMOs without a public master list (e.g. Villagers and Heroes).
 * Returns one synthetic "server" row so existing liveActivity / PlayingNowBadge
 * sums work unchanged. Undercounts mobile and non-Steam clients — label accordingly.
 *
 * Requires STEAM_WEB_API_KEY (same as TF2 GetServerList).
 */

import type { GameServer } from "../types";

const STEAM_PLAYERS_URL =
  "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/";

let warnedMissingKey = false;

function steamApiKey(): string | null {
  const key = process.env.STEAM_WEB_API_KEY?.trim();
  return key || null;
}

export async function fetchSteamConcurrentPlayers(
  appId: number,
  opts?: { label?: string }
): Promise<GameServer[]> {
  const key = steamApiKey();
  if (!key) {
    if (!warnedMissingKey) {
      console.warn(
        "[servers] steam-concurrent: STEAM_WEB_API_KEY is not set — returning empty list"
      );
      warnedMissingKey = true;
    }
    return [];
  }

  const url = new URL(STEAM_PLAYERS_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("appid", String(appId));

  const res = await fetch(url.toString(), {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "application/json",
    },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`Steam GetNumberOfCurrentPlayers returned ${res.status}`);
  }

  const data = (await res.json()) as {
    response?: { result?: number; player_count?: number };
  };
  // result === 1 means success per Steam docs.
  if (data.response?.result !== 1) {
    return [];
  }
  const players = Number(data.response.player_count ?? 0);
  if (!Number.isFinite(players) || players < 0) return [];

  const label = opts?.label ?? `Steam · app ${appId}`;
  return [
    {
      id: `steam-concurrent:${appId}`,
      name: `${label} (Steam clients; excludes mobile)`,
      host: "steam",
      port: 0,
      players,
      maxPlayers: null,
      map: null,
      gameType: "steam-concurrent",
      location: null,
      protected: false,
    },
  ];
}

/** Villagers and Heroes — Steam app 263540. */
export function fetchVillagersAndHeroesPlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(263540, { label: "Villagers and Heroes" });
}

/** Asphalt Legends Unite — Steam app 922250. */
export function fetchAsphaltLegendsUnitePlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(922250, { label: "Asphalt Legends Unite" });
}

/** OpenCiv3 (using Civ 3 Complete Steam app 3910 as proxy for activity). */
export function fetchOpenCiv3Players(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(3910, { label: "OpenCiv3" });
}

/** HoloCure — Save the Fans! — Steam app 2420510. */
export function fetchHoloCurePlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(2420510, { label: "HoloCure" });
}

/** Classic Marathon 2 — Steam app 2398490. */
export function fetchMarathon2Players(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(2398490, { label: "Classic Marathon 2" });
}

/** The Elder Scrolls: Arena — Steam app 1812290. */
export function fetchTesArenaPlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(1812290, { label: "The Elder Scrolls: Arena" });
}

