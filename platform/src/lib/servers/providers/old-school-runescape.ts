import type { GameServer } from "../types";

/**
 * Old School RuneScape worlds from Jagex's own world list.
 *
 * OSRS was previously reported through Steam concurrents, which is close to
 * meaningless for this game — almost nobody launches it through Steam. At the
 * time of writing that read 2,122 while Jagex's world list totalled 132,303.
 *
 * The list at /slu is the same page the game's own world switcher is built
 * from: every world with its live population, datacentre country, and whether
 * it is free or members. It is HTML rather than JSON, so this parses it, and
 * the parser is deliberately strict — a row that does not yield a world number
 * and a player count is skipped rather than guessed at.
 *
 * Unlike other providers this does not slice to MAX_SERVERS. The total shown on
 * the site is the sum of the rows returned, and the top 100 worlds hold only
 * about half the players, so capping would understate the population by tens of
 * thousands. The world list is a bounded set — a few hundred entries — rather
 * than the unbounded master lists that cap exists to protect against.
 */

const WORLD_LIST_URL = "https://oldschool.runescape.com/slu?order=WMLPA";

/** Jagex caps a world at 2,000 players. */
const WORLD_CAPACITY = 2000;

export type OsrsWorld = {
  world: number;
  name: string;
  players: number;
  countryCode: string | null;
  countryName: string | null;
  members: boolean;
  activity: string | null;
};

/** Pure parser, exported for tests — no network. */
export function parseOsrsWorlds(html: string): OsrsWorld[] {
  const worlds: OsrsWorld[] = [];
  const seen = new Set<number>();

  // Each world is one <tr>; splitting first keeps the field patterns from
  // matching across row boundaries.
  const rows = html.split("<tr class=");
  for (const row of rows) {
    const idMatch = row.match(/slu-world-(\d+)'[^>]*>([^<]*)<\/a>/);
    if (!idMatch) continue;
    const world = Number(idMatch[1]);
    if (!Number.isFinite(world) || seen.has(world)) continue;

    const playersMatch = row.match(/>(\d+)\s+players</);
    if (!playersMatch) continue;
    const players = Number(playersMatch[1]);
    if (!Number.isFinite(players) || players < 0) continue;

    const countryMatch = row.match(/row-cell--country[^'"]*row-cell--([A-Z]{2})['"]>([^<]*)</);
    const typeMatch = row.match(/row-cell--type['"]>\s*([^<]*?)\s*</);
    // Last plain cell on the row is the activity ("Trade - Free", "PvP", …).
    const activityMatch = row.match(/row-cell['"]>\s*([^<]*?)\s*<\/td>\s*<\/tr>/);

    seen.add(world);
    worlds.push({
      world,
      name: idMatch[2].trim() || `World ${world}`,
      players,
      countryCode: countryMatch?.[1] ?? null,
      countryName: countryMatch?.[2]?.trim() || null,
      members: /members/i.test(typeMatch?.[1] ?? ""),
      activity: activityMatch?.[1]?.trim() || null,
    });
  }

  return worlds;
}

export function osrsWorldsToServers(worlds: OsrsWorld[]): GameServer[] {
  return worlds
    .map((w) => ({
      id: `osrs-world-${w.world}`,
      name: `${w.name} · World ${w.world}`,
      // Worlds are joined through the client or the world link, not by address,
      // so there is no per-world host to report honestly.
      host: "oldschool.runescape.com",
      port: 0,
      players: w.players,
      maxPlayers: WORLD_CAPACITY,
      map: w.activity,
      gameType: w.members ? "Members" : "Free",
      location: w.countryCode
        ? { countryCode: w.countryCode, region: w.countryName ?? undefined }
        : null,
      protected: false,
    }))
    .sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
}

export async function fetchOldSchoolRuneScapeServers(): Promise<GameServer[]> {
  const res = await fetch(WORLD_LIST_URL, {
    headers: {
      "user-agent": "PlayBound/1.0",
      accept: "text/html",
    },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OSRS world list returned ${res.status}`);

  const html = await res.text();
  const worlds = parseOsrsWorlds(html);
  if (worlds.length === 0) {
    // Jagex changed the markup. Better to say so than to report nobody online.
    throw new Error("OSRS world list returned no parseable worlds");
  }
  return osrsWorldsToServers(worlds);
}
