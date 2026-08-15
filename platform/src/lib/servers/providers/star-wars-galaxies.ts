import { applyCountryCentroid } from "../geo";
import type { GameServer } from "../types";

/**
 * Star Wars Galaxies emulator shards.
 *
 * SWG has no single population source — the game has been community-run since
 * Sony closed it in 2011, and each emulator is an independent project. Of the
 * four PlayBound lists, only SWG Legends publishes a live number:
 *
 *   Legends      live count, rendered into its home page ("OMEGA · ONLINE · 908 PLAYERS")
 *   Infinity     advertises "800+ Weekly Players" — a marketing figure, not a
 *                concurrent count, and not honest to show as one
 *   Restoration  swgr.org answers 403 to anything automated
 *   Beyond       a XenForo forum with no population anywhere on it
 *
 * So this reports the one shard that can be reported, named as itself rather
 * than as "Star Wars Galaxies", because 908 is Legends' population and not the
 * game's. If another shard starts publishing a real figure, add it here.
 *
 * The host is synthetic, following the EverQuest provider: these are not
 * joinable endpoints, and each emulator needs its own launcher.
 */

const LEGENDS_URL = "https://swglegends.com/";

/** Legends runs a single galaxy; the site states its cap as 3,000. */
const LEGENDS_CAPACITY = 3000;

export type ShardStatus = {
  galaxy: string;
  online: boolean;
  players: number;
};

/**
 * Pure parser, exported for tests.
 *
 * Reads the hero line, which carries all three facts at once. Returns null
 * rather than guessing — a redesign should show no shard, not a zero that looks
 * like an empty server.
 */
export function parseLegendsStatus(html: string): ShardStatus | null {
  const m = html.match(/([A-Z][A-Z0-9]*)\s*·\s*(ONLINE|OFFLINE)\s*·\s*([\d,]+)\s*PLAYERS/i);
  if (!m) return null;
  const players = Number(m[3].replace(/,/g, ""));
  if (!Number.isFinite(players) || players < 0) return null;
  return {
    galaxy: m[1].toUpperCase(),
    online: m[2].toUpperCase() === "ONLINE",
    players,
  };
}

export async function fetchStarWarsGalaxiesServers(): Promise<GameServer[]> {
  const res = await fetch(LEGENDS_URL, {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "text/html",
    },
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SWG Legends returned ${res.status}`);

  const status = parseLegendsStatus(await res.text());
  if (!status) throw new Error("SWG Legends status line not found");

  return [
    {
      id: "swg-legends-omega",
      name: `SWG Legends · ${status.galaxy}`,
      host: "swglegends.com",
      port: 0,
      players: status.online ? status.players : 0,
      maxPlayers: LEGENDS_CAPACITY,
      map: null,
      gameType: "Emulator · NGE",
      location: applyCountryCentroid({ countryCode: "US" }),
      protected: false,
    },
  ];
}
