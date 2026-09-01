const SWG_LEGENDS_URL = "https://swglegends.com/";
const LEGENDS_CAPACITY = 3000;

/**
 * Parses the SWG Legends hero status line: "OMEGA · ONLINE · 908 PLAYERS"
 * @param {string} html
 * @returns {{ galaxy: string, online: boolean, players: number } | null}
 */
export function parseLegendsStatus(html) {
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

/**
 * Scrapes SWG Legends shard population.
 * The master adapter runs outside Vercel (Render), avoiding Cloudflare origin 403 blocks.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollSwg() {
  const res = await fetch(SWG_LEGENDS_URL, {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "text/html",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`SWG Legends returned ${res.status}`);
  }

  const html = await res.text();
  const status = parseLegendsStatus(html);
  if (!status) {
    throw new Error("SWG Legends status line not found");
  }

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
      location: { countryCode: "US" },
      protected: false,
    },
  ];
}
