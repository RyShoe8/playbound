import { applyCountryCentroid, locationFromCountryName } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * EverQuest live status + sanctioned community servers.
 *
 * Official Live worlds: Daybreak Census load bands (low/medium/high) mapped to
 * conservative estimated player counts — Census does not expose exact concurrency.
 * Quarm / P99: exact concurrent counts from the public EQEmulator server list.
 *
 * Hosts are synthetic (not joinable endpoints). Locations are region centroids so
 * the web Est. column can show a rough distance-based latency guess.
 *
 * Do not scrape TAKP zonepop for Quarm — that is a different server.
 */

const CENSUS_URL =
  "https://census.daybreakgames.com/json/get/global/game_server_status?game_code=eq&c:limit=100";
const EQEMU_LIST_URL = "https://www.eqemulator.org/index.php?pageid=serverlist";

/** Conservative midpoints for Daybreak status bands (documented for UI/FAQ). */
const LOAD_BAND_PLAYERS: Record<string, number> = {
  low: 15,
  medium: 60,
  high: 150,
  locked: 0,
  down: 0,
};

const US_LOCATION = applyCountryCentroid({ countryCode: "US" });
const US_EAST_LOCATION = applyCountryCentroid({ countryCode: "US", region: "US East" });

type CensusRow = {
  name?: string;
  game_code?: string;
  region_code?: string;
  last_reported_state?: string;
};

function slugifyServerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOfficialLiveServers(): Promise<GameServer[]> {
  const res = await fetch(CENSUS_URL, {
    headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Daybreak Census returned ${res.status}`);
  const data = (await res.json()) as { game_server_status_list?: CensusRow[] };
  const rows = Array.isArray(data.game_server_status_list) ? data.game_server_status_list : [];
  const mapped: GameServer[] = [];
  const liveLocation = locationFromCountryName("United States") ?? US_LOCATION;

  for (const row of rows) {
    const name = String(row.name || "").trim();
    if (!name) continue;
    if (String(row.region_code || "").toLowerCase() !== "live") continue;
    const band = String(row.last_reported_state || "down").toLowerCase();
    const players = LOAD_BAND_PLAYERS[band] ?? 0;
    const id = `daybreak-eq:${slugifyServerName(name)}`;
    mapped.push({
      id,
      name,
      host: id,
      port: 0,
      players,
      maxPlayers: null,
      map: `Load: ${band}`,
      gameType: "official",
      location: liveLocation,
      protected: false,
    });
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return mapped;
}

type EmuMatch = { name: string; players: number };

/**
 * EQEmulator table rows look like:
 *   <font …>588</font></td><td …><font …>Project Quarm</font></td>
 * Count cell precedes the server name.
 */
function parseEqEmuList(html: string): EmuMatch[] {
  const found: EmuMatch[] = [];
  const seen = new Set<string>();
  const rowRe =
    /(\d{1,5})\s*<\/(?:font|span)>\s*<\/td>\s*<td[^>]*>\s*(?:<(?:font|span)[^>]*>\s*)?(Project Quarm|Project 1999 Green|Project 1999 Blue|Project 1999 Red)\s*(?:<\/(?:font|span)>)?/gi;

  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null) {
    const players = Number(match[1]);
    const name = match[2]!.replace(/\s+/g, " ").trim();
    if (!name || seen.has(name) || !Number.isFinite(players)) continue;
    seen.add(name);
    found.push({ name, players });
  }

  // Fallback: look for known names and take the nearest preceding integer cell.
  if (found.length === 0) {
    const patterns: { re: RegExp; name: string }[] = [
      { re: /Project\s+Quarm/i, name: "Project Quarm" },
      { re: /Project\s+1999\s+Green/i, name: "Project 1999 Green" },
      { re: /Project\s+1999\s+Blue/i, name: "Project 1999 Blue" },
      { re: /Project\s+1999\s+Red/i, name: "Project 1999 Red" },
    ];
    for (const { re, name } of patterns) {
      const m = re.exec(html);
      if (!m || m.index == null || seen.has(name)) continue;
      const window = html.slice(Math.max(0, m.index - 250), m.index);
      const nums = [...window.matchAll(/>(\d{1,5})</g)].map((x) => Number(x[1]));
      const players = nums.length ? nums[nums.length - 1]! : 0;
      seen.add(name);
      found.push({ name, players: Number.isFinite(players) ? players : 0 });
    }
  }

  return found;
}

async function fetchCommunityServers(): Promise<GameServer[]> {
  const res = await fetch(EQEMU_LIST_URL, {
    headers: { "user-agent": "PlayBound/1.0", accept: "text/html" },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`EQEmulator server list returned ${res.status}`);
  const html = await res.text();
  const rows = parseEqEmuList(html);
  const mapped: GameServer[] = [];
  const quarmLocation = locationFromCountryName("United States") ?? US_LOCATION;

  for (const row of rows) {
    const name = stripHtml(row.name);
    if (/^Project Quarm$/i.test(name)) {
      mapped.push({
        id: "eqemu:project-quarm",
        name: "Project Quarm",
        host: "eqemu:project-quarm",
        port: 0,
        players: row.players,
        maxPlayers: 1200,
        map: null,
        gameType: "project-quarm",
        location: quarmLocation,
        protected: false,
      });
      continue;
    }
    const p99 = name.match(/^Project 1999 (Green|Blue|Red)$/i);
    if (p99) {
      const realm = p99[1]!.charAt(0).toUpperCase() + p99[1]!.slice(1).toLowerCase();
      mapped.push({
        id: `eqemu:project-99-${realm.toLowerCase()}`,
        name: `Project 1999 ${realm}`,
        host: `eqemu:project-99-${realm.toLowerCase()}`,
        port: 0,
        players: row.players,
        maxPlayers: null,
        map: realm,
        gameType: "project-99",
        location: US_EAST_LOCATION,
        protected: false,
      });
    }
  }

  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return mapped;
}

export async function fetchEverQuestServers(): Promise<GameServer[]> {
  const settled = await Promise.allSettled([fetchOfficialLiveServers(), fetchCommunityServers()]);
  const out: GameServer[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.warn("[servers] everquest source failed:", r.reason?.message || r.reason);
  }
  out.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return out.slice(0, MAX_SERVERS);
}
