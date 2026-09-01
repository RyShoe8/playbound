import { getServerLobbyAuth } from "@/lib/catalog";
import { fetchBeyondAllReasonServers } from "./providers/beyond-all-reason";
import { fetchEverQuestServers } from "./providers/everquest";
import { fetchFlightGearServers } from "./providers/flightgear";
import { fetchFreecivServers } from "./providers/freeciv";
import { fetchHurryCurryServers } from "./providers/hurry-curry";
import { fetchLuantiServers } from "./providers/luanti";
import { fetchOpenArenaServers } from "./providers/openarena";
import { fetchOpenRaPlayerCount, fetchOpenRaServers } from "./providers/openra";
import { fetchRemoteMaster, fetchViaAdapterOrDirect } from "./providers/remote";
import { fetchSuperTuxKartServers } from "./providers/supertuxkart";
import { fetchTeamFortress2Servers } from "./providers/team-fortress-2";
import { fetchSpaceStation14Servers } from "./providers/space-station-14";
import { fetchStarCraftServers } from "./providers/starcraft";
import { fetchWolfensteinEnemyTerritoryServers } from "./providers/wolfenstein-enemy-territory";
import { fetchAsheronsCallServers } from "./providers/asherons-call";
import { fetchCounterStrike2Servers } from "./providers/counter-strike-2";
import { fetchOldSchoolRuneScapeServers } from "./providers/old-school-runescape";
import { fetchStarWarsGalaxiesServers } from "./providers/star-wars-galaxies";
import { fetchRenegadeXServers } from "./providers/renegade-x";
import {
  fetchSteamConcurrentPlayers,
  fetchTombRaider123Players,
  fetchVillagersAndHeroesPlayers,
  fetchAsphaltLegendsUnitePlayers,
  fetchHoloCurePlayers,
  fetchMarathon2Players,
  fetchWarThunderPlayers,
  fetchWorldOfSeaBattlePlayers,
  fetchSwtorPlayers,
  fetchMrBoomPlayers,
  fetchAllegiancePlayers,
  fetchQuakeChampionsPlayers,
  fetchDota2Players,
  fetchStrikersClubPlayers,
  fetchBrawlhallaPlayers,
  fetchAlbionOnlinePlayers,
  fetchGuildWars2Players,
  fetchLotroPlayers,
  fetchDcUniverseOnlinePlayers,
  fetchWarframePlayers,
  fetchApexLegendsPlayers,
  fetchRollerCoasterTycoonPlayers,
  fetchEndlessSkyPlayers,
  fetchNaevPlayers,
  fetchAsphaltLegendsPlayers,
  fetchTheFinalsPlayers,
  fetchEveOnlinePlayers,
  fetchEnlistedPlayers,
  fetchMarvelSnapPlayers,
  fetchPaliaPlayers,
  fetchWhereWindsMeetPlayers,
  fetchRainbowSixSiegePlayers,
  fetchOnceHumanPlayers,
  fetchPathOfExilePlayers,
  fetchStarTrekOnlinePlayers,
} from "./providers/steam-concurrent";
import { fetchZeroKServers } from "./providers/zero-k";
import { fetchLeagueOfLegendsServers } from "./providers/league-of-legends";
import { fetchGenshinImpactServers } from "./providers/genshin-impact";
import { fetchTripleAServers } from "./providers/triplea";
import { hasServerBrowser } from "./browserGames";
import { isUpstreamTimeout } from "./errors";
import type { GameServer, ServerListResult, ServerProvider } from "./types";

// Counting semantics, source priority, and zero-vs-unknown rules are documented
// in platform/docs/player-counts.md. Read that policy before adding a provider.

async function fetchRemoteWithLobbyAuth(slug: string): Promise<GameServer[]> {
  const auth = await getServerLobbyAuth(slug);
  return fetchRemoteMaster(slug, auth);
}

const providers: Record<string, ServerProvider> = {
  openra: { slug: "openra", fetchServers: fetchOpenRaServers, fetchPlayerCount: fetchOpenRaPlayerCount },
  luanti: { slug: "luanti", fetchServers: fetchLuantiServers },
  // First-party registry; servers opt in with the server's --register flag.
  "hurry-curry": { slug: "hurry-curry", fetchServers: fetchHurryCurryServers },
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
  starcraft: {
    slug: "starcraft",
    fetchServers: fetchStarCraftServers,
  },
  morrowind: {
    slug: "morrowind",
    fetchServers: () => fetchRemoteMaster("morrowind"),
  },
  tes3mp: {
    slug: "tes3mp",
    fetchServers: () => fetchRemoteMaster("tes3mp"),
  },
  "wolfenstein-enemy-territory": {
    slug: "wolfenstein-enemy-territory",
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
  "war-thunder": {
    slug: "war-thunder",
    fetchServers: fetchWarThunderPlayers,
  },
  "world-of-sea-battle": {
    slug: "world-of-sea-battle",
    fetchServers: fetchWorldOfSeaBattlePlayers,
  },
  /*
   * Jagex's own world list, not Steam concurrents. Steam reported 2,122 for a
   * game whose world list totalled 132,303 at the same moment — hardly anyone
   * launches OSRS through Steam.
   */
  "old-school-runescape": {
    slug: "old-school-runescape",
    fetchServers: fetchOldSchoolRuneScapeServers,
  },
  /*
   * The published game is star-wars-the-old-republic; "swtor" was a second
   * record created from seed and never published, so the count was being
   * served to a page nobody could reach. Both are registered because the
   * short slug is still what people search for.
   */
  "star-wars-the-old-republic": {
    slug: "star-wars-the-old-republic",
    fetchServers: fetchSwtorPlayers,
  },
  swtor: {
    slug: "swtor",
    fetchServers: fetchSwtorPlayers,
  },
  /*
   * Only SWG Legends of the four shards publishes a live count; see the
   * provider for what the other three offer instead.
   */
  "star-wars-galaxies": {
    slug: "star-wars-galaxies",
    // Cloudflare answers 403 to Vercel and 200 to the same headers from an
    // ordinary network, so the adapter is tried first and this is the fallback.
    fetchServers: () =>
      fetchViaAdapterOrDirect("star-wars-galaxies", fetchStarWarsGalaxiesServers),
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
  "quake-champions": {
    slug: "quake-champions",
    fetchServers: fetchQuakeChampionsPlayers,
  },
  "league-of-legends": {
    slug: "league-of-legends",
    fetchServers: fetchLeagueOfLegendsServers,
  },
  "dota-2": {
    slug: "dota-2",
    fetchServers: fetchDota2Players,
  },
  "genshin-impact": {
    slug: "genshin-impact",
    fetchServers: fetchGenshinImpactServers,
  },
  triplea: {
    slug: "triplea",
    fetchServers: fetchTripleAServers,
  },
  "strikers-club": {
    slug: "strikers-club",
    fetchServers: fetchStrikersClubPlayers,
  },
  brawlhalla: {
    slug: "brawlhalla",
    fetchServers: fetchBrawlhallaPlayers,
  },
  "albion-online": {
    slug: "albion-online",
    fetchServers: fetchAlbionOnlinePlayers,
  },
  "guild-wars-2": {
    slug: "guild-wars-2",
    fetchServers: fetchGuildWars2Players,
  },
  "lord-of-the-rings-online": {
    slug: "lord-of-the-rings-online",
    fetchServers: fetchLotroPlayers,
  },
  "dc-universe-online": {
    slug: "dc-universe-online",
    fetchServers: fetchDcUniverseOnlinePlayers,
  },
  warframe: {
    slug: "warframe",
    fetchServers: fetchWarframePlayers,
  },
  "apex-legends": {
    slug: "apex-legends",
    fetchServers: fetchApexLegendsPlayers,
  },
  "rollercoaster-tycoon": {
    slug: "rollercoaster-tycoon",
    fetchServers: fetchRollerCoasterTycoonPlayers,
  },
  "endless-sky": {
    slug: "endless-sky",
    fetchServers: fetchEndlessSkyPlayers,
  },
  naev: {
    slug: "naev",
    fetchServers: fetchNaevPlayers,
  },
  "asphalt-legends": {
    slug: "asphalt-legends",
    fetchServers: fetchAsphaltLegendsPlayers,
  },
  "the-finals": {
    slug: "the-finals",
    fetchServers: fetchTheFinalsPlayers,
  },
  "eve-online": {
    slug: "eve-online",
    fetchServers: fetchEveOnlinePlayers,
  },
  enlisted: {
    slug: "enlisted",
    fetchServers: fetchEnlistedPlayers,
  },
  "marvel-snap": {
    slug: "marvel-snap",
    fetchServers: fetchMarvelSnapPlayers,
  },
  palia: {
    slug: "palia",
    fetchServers: fetchPaliaPlayers,
  },
  "where-winds-meet": {
    slug: "where-winds-meet",
    fetchServers: fetchWhereWindsMeetPlayers,
  },
  "rainbow-six-siege": {
    slug: "rainbow-six-siege",
    fetchServers: fetchRainbowSixSiegePlayers,
  },
  "once-human": {
    slug: "once-human",
    fetchServers: fetchOnceHumanPlayers,
  },
  "path-of-exile": {
    slug: "path-of-exile",
    fetchServers: fetchPathOfExilePlayers,
  },
  "star-trek-online": {
    slug: "star-trek-online",
    fetchServers: fetchStarTrekOnlinePlayers,
  },
  // Newly catalogued commercial classics. These are exact Steam App IDs, so
  // the rows are labelled Steam-only and are never presented as the whole
  // cross-store population. See docs/player-counts.md.
  "stronghold-crusader-hd": {
    slug: "stronghold-crusader-hd",
    fetchServers: () =>
      fetchSteamConcurrentPlayers(40970, { label: "Stronghold Crusader HD" }),
  },
  "s-t-a-l-k-e-r-shadow-of-chernobyl": {
    slug: "s-t-a-l-k-e-r-shadow-of-chernobyl",
    fetchServers: () =>
      fetchSteamConcurrentPlayers(4500, { label: "S.T.A.L.K.E.R.: Shadow of Chernobyl" }),
  },
  "s-t-a-l-k-e-r-call-of-pripyat": {
    slug: "s-t-a-l-k-e-r-call-of-pripyat",
    fetchServers: () =>
      fetchSteamConcurrentPlayers(41700, { label: "S.T.A.L.K.E.R.: Call of Pripyat" }),
  },
  "star-wars-knights-of-the-old-republic": {
    slug: "star-wars-knights-of-the-old-republic",
    fetchServers: () =>
      fetchSteamConcurrentPlayers(32370, { label: "Star Wars: Knights of the Old Republic" }),
  },
  "star-wars-knights-of-the-old-republic-ii-the-sith-lords": {
    slug: "star-wars-knights-of-the-old-republic-ii-the-sith-lords",
    fetchServers: () =>
      fetchSteamConcurrentPlayers(208580, { label: "KOTOR II: The Sith Lords" }),
  },
  "thief-gold": {
    slug: "thief-gold",
    fetchServers: () => fetchSteamConcurrentPlayers(211600, { label: "Thief Gold" }),
  },
  "thief-2-the-metal-age": {
    slug: "thief-2-the-metal-age",
    fetchServers: () =>
      fetchSteamConcurrentPlayers(211740, { label: "Thief II: The Metal Age" }),
  },
  "ground-control-anthology": {
    slug: "ground-control-anthology",
    fetchServers: () =>
      fetchSteamConcurrentPlayers(254820, { label: "Ground Control Anthology" }),
  },
  "ground-control-2-operation-exodus": {
    slug: "ground-control-2-operation-exodus",
    fetchServers: () =>
      fetchSteamConcurrentPlayers(254840, { label: "Ground Control II: Operation Exodus" }),
  },
  "tomb-raider-123": {
    slug: "tomb-raider-123",
    fetchServers: fetchTombRaider123Players,
  },
  "renegade-x": {
    slug: "renegade-x",
    fetchServers: fetchRenegadeXServers,
  },
};

/**
 * Draft / catalog multiplayer titles without an honest public master or status API
 * in this pass (do not invent lobby rows). Revisit when a stable source exists:
 * - swg Infinity, Restoration and Beyond shards (Infinity advertises a weekly
 *   figure rather than a concurrent one, Restoration 403s automated requests,
 *   Beyond publishes nothing; SWG Legends is wired)
 * - diablo-2 (Battle.net / closed)
 * - world-of-tanks, apex-legends, hearthstone, genshin-impact, dota-2,
 *   league-of-legends, valorant, quake-champions (matchmaking only; Riot and
 *   Blizzard titles publish neither a master list nor a concurrent count, and
 *   third-party player estimates are models rather than measurements)
 * - war-thunder, world-of-sea-battle, star-wars-the-old-republic, marathon-2
 *   (Steam concurrent count only; no public server browser exists)
 * - tes-arena (single-player only; a 1994 game with no multiplayer has no place
 *   in a server browser, and the Steam count went with it since the registry is
 *   what supplies both)
 * - freedoom, lincity-ng, daggerfall, pixreveal (not server-browser games)
 * - gamebuddies-io (browser party; no public master)
 * - openciv3, tomb-raider-123 (offline single-player games with no service to query;
 *   they previously reported Civilization III and Tomb Raider 1996 Steam counts
 *   as proxies, which measured a different audience under the project's name)
 * - keeperfx (direct-IP multiplayer arranged via Discord; the masterserver in
 *   dkfans/keeperfx-masterserver is not deployed anywhere public)
 *
 * Slugs that already advertise launchMethods "server" but still lack a provider
 * can be listed in UNSUPPORTED_SERVER_SLUGS so the launcher index can show them
 * as "coming soon" without a false "supported" flag.
 */
export const UNSUPPORTED_SERVER_SLUGS = [] as const;

export {
  hasServerBrowser,
  isSingleMasterGame,
  listServerBrowserSlugs,
} from "./browserGames";

export function listProviderSlugs(): string[] {
  return Object.keys(providers);
}

export function hasServerProvider(slug: string): boolean {
  return Boolean(providers[slug]);
}

export function isKnownServerGame(slug: string): boolean {
  return hasServerBrowser(slug) || (UNSUPPORTED_SERVER_SLUGS as readonly string[]).includes(slug);
}

export async function listServersForGame(slug: string): Promise<ServerListResult> {
  /*
   * The clock is read after the fetch, not before it.
   *
   * `updatedAt` means "when this list was retrieved", so taking the reading
   * first was always slightly wrong — it timestamped the attempt rather than
   * the answer, and by up to the fifteen-second provider timeout.
   *
   * Cache Components makes it an error rather than an inaccuracy: a prerender
   * may not read the current time until it has read some real data first, and
   * this was the first statement in the function. That failed the build of the
   * homepage, whose live-servers section calls it for three games.
   *
   * The unsupported branch has no fetch to sit behind, and no list to
   * timestamp either, so it reports the epoch instead of inventing a reading.
   */
  const provider = providers[slug];
  if (!provider) {
    return { supported: false, servers: [], updatedAt: new Date(0).toISOString() };
  }
  try {
    const servers: GameServer[] = await provider.fetchServers();
    return { supported: true, servers, updatedAt: new Date().toISOString() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load servers";
    if (isUpstreamTimeout(err)) {
      // Upstream population feeds are best-effort. Keep the response honest
      // (unavailable, not a false zero) without dumping every DOMException
      // constant into the production error log.
      console.info(`[servers] ${slug}: upstream request timed out; server list unavailable`);
    } else {
      console.error(`[servers] ${slug}:`, err);
    }
    return { supported: true, servers: [], updatedAt: new Date().toISOString(), error: message };
  }
}

export async function getPlayerCountForGame(
  slug: string
): Promise<{ players: number; servers: number }> {
  const provider = providers[slug];
  if (!provider) return { players: 0, servers: 0 };
  if (provider.fetchPlayerCount) {
    return provider.fetchPlayerCount();
  }
  const result = await listServersForGame(slug);
  const servers = result.servers ?? [];
  return {
    players: servers.reduce((sum, s) => sum + (Number(s.players) || 0), 0),
    servers: servers.length,
  };
}
