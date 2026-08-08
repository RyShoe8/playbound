import { getServerLobbyAuth } from "@/lib/catalog";
import { fetchBeyondAllReasonServers } from "./providers/beyond-all-reason";
import { fetchEverQuestServers } from "./providers/everquest";
import { fetchFlightGearServers } from "./providers/flightgear";
import { fetchFreecivServers } from "./providers/freeciv";
import { fetchLuantiServers } from "./providers/luanti";
import { fetchOpenArenaServers } from "./providers/openarena";
import { fetchOpenRaServers } from "./providers/openra";
import { fetchOpenRct2Servers } from "./providers/openrct2";
import { fetchRemoteMaster } from "./providers/remote";
import { fetchSuperTuxKartServers } from "./providers/supertuxkart";
import { fetchWarzone2100Servers } from "./providers/warzone-2100";
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
    fetchServers: fetchWarzone2100Servers,
  },
  "zero-k": {
    slug: "zero-k",
    fetchServers: fetchZeroKServers,
  },
  "0ad": { slug: "0ad", fetchServers: () => fetchRemoteWithLobbyAuth("0ad") },
  everquest: { slug: "everquest", fetchServers: fetchEverQuestServers },
  // Draft catalog games — providers ready; stay hidden on public /servers until published.
  freeciv: { slug: "freeciv", fetchServers: fetchFreecivServers },
  openarena: { slug: "openarena", fetchServers: fetchOpenArenaServers },
  openrct2: { slug: "openrct2", fetchServers: fetchOpenRct2Servers },
  flightgear: { slug: "flightgear", fetchServers: fetchFlightGearServers },
};

/**
 * Draft / catalog multiplayer titles without an honest public master or status API
 * in this pass (do not invent lobby rows). Revisit when a stable source exists:
 * - star-wars-galaxies (edition-specific emulators; EQ-style pop later)
 * - starcraft, diablo-2 (Battle.net / closed)
 * - war-thunder, world-of-tanks, apex-legends, hearthstone, genshin-impact,
 *   dota-2, league-of-legends, valorant, counter-strike-2, quake-champions
 *   (matchmaking; no public PC master we wire today)
 * - team-fortress-2 (needs Steam Web API + A2S; not wired)
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
