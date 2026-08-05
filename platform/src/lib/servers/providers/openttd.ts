import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * OpenTTD hides raw IPs on the public listing (Game Coordinator invites).
 * We scrape https://servers.openttd.org/listing for names, player counts,
 * companies, play time, and invite IDs. Join uses the invite as host.
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

  // Row: invite link, name, clients a/b, companies c/d, play time, version…
  const rowRe =
    /href="\/server\/(\+[A-Za-z0-9]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]*?(\d+)\s*\/\s*(\d+)[\s\S]*?(\d+)\s*\/\s*(\d+)[\s\S]*?(\d+h\s*\d+m|\d+h|\d+m)/gi;
  const mapped: GameServer[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null) {
    const invite = match[1];
    const name = match[2].replace(/\s+/g, " ").trim();
    const players = Number(match[3]) || 0;
    const maxPlayers = Number(match[4]) || null;
    const companies = Number(match[5]) || 0;
    const maxCompanies = Number(match[6]) || 0;
    const playTime = (match[7] || "").replace(/\s+/g, " ").trim();
    if (!invite || !name || seen.has(invite)) continue;
    seen.add(invite);

    const slice = html.slice(match.index, match.index + 1600);
    const ver = slice.match(/href="\/listing\/([^"]+)"/)?.[1] || null;

    const modeParts = [
      ver,
      maxCompanies > 0 ? `${companies}/${maxCompanies} cos` : null,
      playTime || null,
    ].filter(Boolean);

    mapped.push({
      id: invite,
      name,
      host: invite,
      port: 3979,
      players,
      maxPlayers,
      map: null,
      gameType: modeParts.length ? modeParts.join(" · ") : null,
      location: null,
      protected: false,
    });
  }

  // Fallback: older scrape if table markup changed and rich regex found nothing
  if (mapped.length === 0) {
    const simpleRe =
      /href="\/server\/(\+[A-Za-z0-9]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]*?(\d+)\s*\/\s*(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = simpleRe.exec(html)) !== null) {
      const invite = m[1];
      const name = m[2].replace(/\s+/g, " ").trim();
      if (!invite || !name || seen.has(invite)) continue;
      seen.add(invite);
      const slice = html.slice(m.index, m.index + 1200);
      const ver = slice.match(/href="\/listing\/([^"]+)"/)?.[1] || null;
      mapped.push({
        id: invite,
        name,
        host: invite,
        port: 3979,
        players: Number(m[3]) || 0,
        maxPlayers: Number(m[4]) || null,
        map: null,
        gameType: ver,
        location: null,
        protected: false,
      });
    }
  }

  mapped.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  // Invite hosts aren't resolvable IPs — skip GeoIP noise.
  return mapped.slice(0, MAX_SERVERS);
}
