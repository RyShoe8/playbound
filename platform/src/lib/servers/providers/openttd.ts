import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * OpenTTD hides raw IPs on the public listing (Game Coordinator invites).
 * We scrape https://servers.openttd.org/listing for names, player counts, and
 * invite IDs so the browser still works. Join uses the invite as host; the
 * OpenTTD client accepts invite codes in multiplayer (port is a placeholder).
 */
export async function fetchOpenTtdServers(): Promise<GameServer[]> {
  const res = await fetch("https://servers.openttd.org/listing", {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "text/html",
    },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenTTD listing returned ${res.status}`);
  const html = await res.text();

  const rowRe =
    /href="\/server\/(\+[A-Za-z0-9]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]*?(\d+)\s*\/\s*(\d+)/g;
  const mapped: GameServer[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null) {
    const invite = match[1];
    const name = match[2].replace(/\s+/g, " ").trim();
    const players = Number(match[3]) || 0;
    const maxPlayers = Number(match[4]) || null;
    if (!invite || !name || seen.has(invite)) continue;
    seen.add(invite);

    // Version sits in a nearby /listing/X.Y link — best-effort after the row.
    const slice = html.slice(match.index, match.index + 1200);
    const ver = slice.match(/href="\/listing\/([^"]+)"/)?.[1] || null;

    mapped.push({
      id: invite,
      name,
      host: invite,
      port: 3979,
      players,
      maxPlayers,
      map: null,
      gameType: ver,
      location: null,
      protected: false,
    });
  }

  mapped.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  // Invite hosts aren't resolvable IPs — skip GeoIP noise.
  return mapped.slice(0, MAX_SERVERS);
}
