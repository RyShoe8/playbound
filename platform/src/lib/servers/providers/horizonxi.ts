import type { GameServer } from "../types";

/**
 * HorizonXI's own live character count, for the `final-fantasy-xi` catalog row.
 *
 * Source: `https://api.horizonxi.com/api/v1/misc/status`, the exact endpoint the
 * project's website calls to render the "N ONLINE" figure in its own header —
 * found by reading the site bundle's request builder rather than guessing. It is
 * first-party, unauthenticated, and returns a bare integer with
 * `Cache-Control: public, max-age=5`. No login-gated or scraped page is touched.
 *
 * What the number means, per docs/player-counts.md:
 *   - It is HorizonXI's own count of characters currently logged in, which is
 *     the complete population of that server. Horizon is single-box — one
 *     account per IP address — so characters and players track closely, which is
 *     unusual for an MMO and is the reason this is honest as `Playing now`.
 *   - It covers the Horizon server only. Square Enix publishes nothing
 *     comparable for retail FFXI, and the Steam app is a tiny slice of a
 *     twenty-year-old game sold mostly outside Steam, so it is deliberately not
 *     used here and the two are never summed.
 *
 * The count belongs to the `horizon` edition specifically. It is attached to the
 * parent game because Horizon is the only route PlayBound installs, which is the
 * case the policy's "an edition may have its own population" note allows.
 */

const STATUS_URL = "https://api.horizonxi.com/api/v1/misc/status";

/** Horizon's world, as one synthetic row so liveActivity sums work unchanged. */
const SERVER_ID = "horizonxi-world";
const SERVER_HOST = "horizonxi.com";

/**
 * Parse the endpoint's body.
 *
 * Returns null — never 0 — for anything unparseable. The response is a bare
 * integer with no envelope, so `Number("")` yielding 0 and `parseInt` on an
 * error page yielding NaN are both real failure modes, and a zero here would
 * read as "the server is empty" on every game card.
 */
export function parseHorizonPlayerCount(body: string): number | null {
  const trimmed = body.trim();
  if (!/^\d{1,7}$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

async function fetchOnline(): Promise<number> {
  const res = await fetch(STATUS_URL, {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json, text/plain" },
    // The upstream sets max-age=5; 60s is plenty for a figure in the hundreds
    // and keeps PlayBound from hammering a volunteer-run API.
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`horizonxi status returned HTTP ${res.status}`);
  }
  const parsed = parseHorizonPlayerCount(await res.text());
  if (parsed === null) {
    // Throw rather than return zero: an unknown population must not be
    // presented as an empty one.
    throw new Error("horizonxi status returned a non-numeric body");
  }
  return parsed;
}

export async function fetchHorizonXiServers(): Promise<GameServer[]> {
  const players = await fetchOnline();
  return [
    {
      id: SERVER_ID,
      name: "HorizonXI (Treasures of Aht Urhgan · level cap 75)",
      host: SERVER_HOST,
      // Horizon does not publish a client port, and the launcher handles
      // connection entirely. 0 marks "not directly joinable by address".
      port: 0,
      players,
      // No published cap. The server has load-tested 430+ players in one zone,
      // but that is a stress result, not a limit, so claiming one would be a
      // guess.
      maxPlayers: null,
      map: "Vana'diel",
      gameType: "Level 75 era",
      location: null,
      protected: false,
    },
  ];
}

export async function fetchHorizonXiPlayerCount(): Promise<{
  players: number;
  servers: number;
}> {
  return { players: await fetchOnline(), servers: 1 };
}
