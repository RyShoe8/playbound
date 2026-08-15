/**
 * Steam concurrent player count via ISteamUserStats/GetNumberOfCurrentPlayers.
 *
 * Used for closed MMOs without a public master list (e.g. Villagers and Heroes).
 * Returns one synthetic "server" row so existing liveActivity / PlayingNowBadge
 * sums work unchanged.
 *
 * The key is optional — this endpoint is public. See fetchSteamConcurrentPlayers.
 *
 * Every figure here counts Steam clients only, so it is a floor rather than a
 * total for anything also sold or launched elsewhere. Keep labels plain: the
 * row already appends "(Steam players only)".
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
  /*
   * The key is optional here. GetNumberOfCurrentPlayers is a public endpoint —
   * verified against CS2, TF2, War Thunder, SWTOR, Marathon 2, TES Arena and
   * HoloCure with no key at all, all answering result 1 with a real count.
   *
   * This used to return an empty list whenever STEAM_WEB_API_KEY was unset,
   * which silently zeroed the player count for every game that depends on this
   * provider. Sent when we have one, since a keyed request gets the friendlier
   * rate limit, and simply omitted when we do not.
   */
  const key = steamApiKey();
  if (!key && !warnedMissingKey) {
    console.warn(
      "[servers] steam-concurrent: STEAM_WEB_API_KEY is not set — using the public endpoint unkeyed"
    );
    warnedMissingKey = true;
  }

  const url = new URL(STEAM_PLAYERS_URL);
  if (key) url.searchParams.set("key", key);
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

  /*
   * "Steam players only" rather than "excludes mobile". Several games here are
   * played mostly somewhere else — War Thunder and SWTOR through their own
   * launchers, Old School RuneScape through Jagex's client and on phones — so
   * naming mobile as the single omission understated the gap by a lot. The
   * count is accurate for what it measures; the caption now says what that is.
   */
  const label = opts?.label ?? `Steam · app ${appId}`;
  return [
    {
      id: `steam-concurrent:${appId}`,
      name: `${label} (Steam players only)`,
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

/*
 * OpenCiv3 and OpenLara deliberately have no entry here.
 *
 * They used to report Civilization III Complete (app 3910) and Tomb Raider
 * 1996 (app 224960) as stand-ins. Those count people playing the original
 * commercial games — neither open-source project is on Steam — so the figure
 * described a different audience while carrying the project's name. Both are
 * offline single-player engines with no service, no accounts and no telemetry,
 * so there is nothing real to query and no proxy worth the misdirection.
 */

/** HoloCure — Save the Fans! — Steam app 2420510. */
export function fetchHoloCurePlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(2420510, { label: "HoloCure" });
}

/** Classic Marathon 2 — Steam app 2398490. */
export function fetchMarathon2Players(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(2398490, { label: "Classic Marathon 2" });
}


/** War Thunder — Steam app 236390. */
export function fetchWarThunderPlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(236390, { label: "War Thunder" });
}

/**
 * World of Sea Battle — Steam app 2948190.
 *
 * Was 2579170, which is not a Steam app at all: appdetails answers
 * success:false for it and the player-count call 404s. The game page had been
 * showing a server error rather than a population.
 */
export function fetchWorldOfSeaBattlePlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(2948190, { label: "World of Sea Battle" });
}


/** Star Wars: The Old Republic — Steam app 1286830. */
export function fetchSwtorPlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(1286830, { label: "Star Wars: The Old Republic" });
}

/** Mr. Boom — Steam app 1351050. */
export function fetchMrBoomPlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(1351050, { label: "Mr. Boom" });
}

/** Microsoft Allegiance — Steam app 700480. */
export function fetchAllegiancePlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(700480, { label: "Microsoft Allegiance" });
}

/** Quake Champions — Steam app 611500. */
export function fetchQuakeChampionsPlayers(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(611500, { label: "Quake Champions" });
}

/** Dota 2 — Steam app 570. */
export function fetchDota2Players(): Promise<GameServer[]> {
  return fetchSteamConcurrentPlayers(570, { label: "Dota 2" });
}



