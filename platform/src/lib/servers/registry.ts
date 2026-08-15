import { getServerLobbyAuth } from "@/lib/catalog";
import { fetchBeyondAllReasonServers } from "./providers/beyond-all-reason";
import { fetchEverQuestServers } from "./providers/everquest";
import { fetchFlightGearServers } from "./providers/flightgear";
import { fetchFreecivServers } from "./providers/freeciv";
import { fetchLuantiServers } from "./providers/luanti";
import { fetchOpenArenaServers } from "./providers/openarena";
import { fetchOpenRaServers } from "./providers/openra";
import { fetchRemoteMaster } from "./providers/remote";
import { fetchSuperTuxKartServers } from "./providers/supertuxkart";
import { fetchTeamFortress2Servers } from "./providers/team-fortress-2";
import { fetchSpaceStation14Servers } from "./providers/space-station-14";
import { fetchStarCraftServers } from "./providers/starcraft";
import { fetchWolfensteinEnemyTerritoryServers } from "./providers/wolfenstein-enemy-territory";
import { fetchAsheronsCallServers } from "./providers/asherons-call";
import { fetchCounterStrike2Servers } from "./providers/counter-strike-2";
import {
  fetchVillagersAndHeroesPlayers,
  fetchAsphaltLegendsUnitePlayers,
  fetchOpenCiv3Players,
  fetchHoloCurePlayers,
  fetchMarathon2Players,
  fetchTesArenaPlayers,
  fetchOpenLaraPlayers,
  fetchWarThunderPlayers,
  fetchWorldOfSeaBattlePlayers,
  fetchOldSchoolRuneScapePlayers,
  fetchSwtorPlayers,
  fetchMrBoomPlayers,
  fetchAllegiancePlayers,
} from "./providers/steam-concurrent";
import { fetchZeroKServers } from "./providers/zero-k";
import type { GameServer, ServerListResult, ServerProvider } from "./types";

async function fetchRemoteWithLobbyAuth(slug: string): Promise<GameServer[]> {
  const auth = await getServerLobbyAuth(slug);
  return fetchRemoteMaster(slug, auth);
}

const providers: Record<string, ServerProvider> = {
  openra: { slug: "openra", fetchServers: fetchOpenRaServers },
  luanti: { slug: "luanti", fetchServers: fetchLuantiServers },
  // Listing + detail enrich runs on the always-on Master Adapter (~2 min)
  openttd: { slug: "openttd", fetchServers: () => fetchRemoteMaster("openttd") },
  // UDP query_port enrichment runs on the always-on Master Adapter
  veloren: { slug: "veloren", fetchServers: () => fetchRemoteMaster("veloren") },
  "beyond-all-reason": {
    slug: "beyond-all-reason",
    fetchServers: fetchBeyondAllReasonServers,
  },
  supertuxkart: { slug: "supertuxkart", fetchServers: fetchSuperTuxKartServers },
  xonotic: { slug: "xonotic", fetchServers: () => fetchRemoteMaster("xonotic") },
  unvanquished: { slug: "unvanquished", fetchServers: () => fetchRemoteMaster("unvanquished") },
  mindustry: { slug: "mindustry", fetchServers: () => fetchRemoteMaster("mindustry") },
  hedgewars: { slug: "hedgewars", fetchServers: () => fetchRemoteMaster("hedgewars") },
  "battle-for-wesnoth": {
    slug: "battle-for-wesnoth",
    fetchServers: () => fetchRemoteWithLobbyAuth("battle-for-wesnoth"),
  },
  "warzone-2100": {
    slug: "warzone-2100",
    fetchServers: () => fetchRemoteMaster("warzone-2100"),
  },
  "zero-k": {
    slug: "zero-k",
    fetchServers: fetchZeroKServers,
  },
  "0ad": { slug: "0ad", fetchServers: () => fetchRemoteWithLobbyAuth("0ad") },
  everquest: { slug: "everquest", fetchServers: fetchEverQuestServers },
  "asherons-call": {
    slug: "asherons-call",
    fetchServers: fetchAsheronsCallServers,
  },
  // Space Station 14 official Hub API
  "space-station-14": {
    slug: "space-station-14",
    fetchServers: fetchSpaceStation14Servers,
  },
  "space-station-14-multiplayer-disaster-simulator": {
    slug: "space-station-14-multiplayer-disaster-simulator",
    fetchServers: fetchSpaceStation14Servers,
  },
  starcraft: {
    slug: "starcraft",
    fetchServers: fetchStarCraftServers,
  },
  "wolfenstein-enemy-territory": {
    slug: "wolfenstein-enemy-territory",
    fetchServers: fetchWolfensteinEnemyTerritoryServers,
  },
  wolfenstein: {
    slug: "wolfenstein",
    fetchServers: fetchWolfensteinEnemyTerritoryServers,
  },
  "counter-strike-2": {
    slug: "counter-strike-2",
    fetchServers: fetchCounterStrike2Servers,
  },
  // Testing catalog games — visible to testers/admins via includeTesting; public
  // homepage Active Players stays published-only until status flips.
  freeciv: { slug: "freeciv", fetchServers: fetchFreecivServers },
  openarena: { slug: "openarena", fetchServers: fetchOpenArenaServers },
  flightgear: { slug: "flightgear", fetchServers: fetchFlightGearServers },
  "team-fortress-2": {
    slug: "team-fortress-2",
    fetchServers: fetchTeamFortress2Servers,
  },
  // Steam concurrent only
  "villagers-and-heroes": {
    slug: "villagers-and-heroes",
    fetchServers: fetchVillagersAndHeroesPlayers,
  },
  "asphalt-legends-unite": {
    slug: "asphalt-legends-unite",
    fetchServers: fetchAsphaltLegendsUnitePlayers,
  },
  openciv3: {
    slug: "openciv3",
    fetchServers: fetchOpenCiv3Players,
  },
  holocure: {
    slug: "holocure",
    fetchServers: fetchHoloCurePlayers,
  },
  alephone: {
    slug: "alephone",
    fetchServers: fetchMarathon2Players,
  },
  "marathon-2": {
    slug: "marathon-2",
    fetchServers: fetchMarathon2Players,
  },
  "tes-arena": {
    slug: "tes-arena",
    fetchServers: fetchTesArenaPlayers,
  },
  openlara: {
    slug: "openlara",
    fetchServers: fetchOpenLaraPlayers,
  },
  "war-thunder": {
    slug: "war-thunder",
    fetchServers: fetchWarThunderPlayers,
  },
  "world-of-sea-battle": {
    slug: "world-of-sea-battle",
    fetchServers: fetchWorldOfSeaBattlePlayers,
  },
  "old-school-runescape": {
    slug: "old-school-runescape",
    fetchServers: fetchOldSchoolRuneScapePlayers,
  },
  swtor: {
    slug: "swtor",
    fetchServers: fetchSwtorPlayers,
  },
  mrboom: {
    slug: "mrboom",
    fetchServers: fetchMrBoomPlayers,
  },
  "microsoft-allegiance": {
    slug: "microsoft-allegiance",
    fetchServers: fetchAllegiancePlayers,
  },
  allegiance: {
    slug: "allegiance",
    fetchServers: fetchAllegiancePlayers,
  },
};

/**
 * Draft / catalog multiplayer titles without an honest public master or status API
 * in this pass (do not invent lobby rows). Revisit when a stable source exists:
 * - star-wars-galaxies (edition-specific emulators; EQ-style pop later)
 * - starcraft, diablo-2 (Battle.net / closed)
 * - war-thunder, world-of-tanks, apex-legends, hearthstone, genshin-impact,
 *   dota-2, league-of-legends, valorant, counter-strike-2, quake-champions
 *   (matchmaking; no public PC master we wire today)
 * - freedoom, lincity-ng, daggerfall, tes-arena, pixreveal (not server-browser games)
 * - gamebuddies-io (browser party; no public master)
 *
 * Slugs that already advertise launchMethods "server" but still lack a provider
 * can be listed in UNSUPPORTED_SERVER_SLUGS so the launcher index can show them
 * as "coming soon" without a false "supported" flag.
 */
export const UNSUPPORTED_SERVER_SLUGS = [] as const;

export function listProviderSlugs(): string[] {
  return Object.keys(providers);
}

export function hasServerProvider(slug: string): boolean {
  return Boolean(providers[slug]);
}

export function isKnownServerGame(slug: string): boolean {
  return hasServerProvider(slug) || (UNSUPPORTED_SERVER_SLUGS as readonly string[]).includes(slug);
}

export async function listServersForGame(slug: string): Promise<ServerListResult> {
  const updatedAt = new Date().toISOString();
  const provider = providers[slug];
  if (!provider) {
    return { supported: false, servers: [], updatedAt };
  }
  try {
    const servers: GameServer[] = await provider.fetchServers();
    return { supported: true, servers, updatedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load servers";
    console.error(`[servers] ${slug}:`, err);
    return { supported: true, servers: [], updatedAt, error: message };
  }
}
