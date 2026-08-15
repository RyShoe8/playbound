import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";
import { fetchSteamConcurrentPlayers } from "./steam-concurrent";
import { mapSteamServerListRows, type SteamServerListRow } from "./team-fortress-2";

/**
 * Counter-Strike 2 community servers via Steam Web API GetServerList.
 *
 * This file previously shipped a hand-written list of six servers with invented
 * player counts, maps and locations. It looked like a live browser and never
 * changed, which is worse than showing nothing: a stale number a visitor can
 * disprove by clicking through costs more trust than an empty list does.
 * Everything here now comes from Valve.
 *
 * Same shape as the Team Fortress 2 provider — CS2 is a Source game on the same
 * infrastructure, so the row mapper is shared rather than duplicated.
 *
 * Needs STEAM_WEB_API_KEY. Without it, or if Valve refuses the request, this
 * falls back to the live concurrent player count, which is a real figure from a
 * public endpoint and needs no key.
 */

const APP_ID = 730;
const STEAM_LIST_URL = "https://api.steampowered.com/IGameServersService/GetServerList/v1/";

function steamApiKey(): string | null {
  const key = process.env.STEAM_WEB_API_KEY?.trim();
  return key || null;
}

export async function fetchCounterStrike2Servers(): Promise<GameServer[]> {
  const key = steamApiKey();
  if (!key) {
    return fetchSteamConcurrentPlayers(APP_ID, { label: "Counter-Strike 2" });
  }

  const url = new URL(STEAM_LIST_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("filter", `\\appid\\${APP_ID}`);
  url.searchParams.set("limit", String(MAX_SERVERS));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "user-agent": "PlayBound/1.0",
        accept: "application/json",
      },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      /*
       * GetServerList answers 403 to a key that is missing, expired or not
       * entitled to it. Falling back rather than throwing means the page still
       * shows a true player count instead of an error, and the count is what
       * most visitors came for.
       */
      throw new Error(`Steam GetServerList returned ${res.status}`);
    }

    const data = (await res.json()) as {
      response?: { servers?: SteamServerListRow[] };
    };
    const rows = Array.isArray(data?.response?.servers) ? data.response.servers : [];
    if (rows.length === 0) {
      return fetchSteamConcurrentPlayers(APP_ID, { label: "Counter-Strike 2" });
    }
    return attachGeo(mapSteamServerListRows(rows, "csgo"));
  } catch (err) {
    console.warn(
      "[servers] counter-strike-2: server list unavailable, using concurrent count —",
      err instanceof Error ? err.message : err
    );
    return fetchSteamConcurrentPlayers(APP_ID, { label: "Counter-Strike 2" });
  }
}
