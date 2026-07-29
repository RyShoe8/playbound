import { getServerLobbyAuth } from "@/lib/catalog";
import { fetchBeyondAllReasonServers } from "./providers/beyond-all-reason";
import { fetchLuantiServers } from "./providers/luanti";
import { fetchOpenRaServers } from "./providers/openra";
import { fetchOpenTtdServers } from "./providers/openttd";
import { fetchRemoteMaster } from "./providers/remote";
import { fetchSuperTuxKartServers } from "./providers/supertuxkart";
import { fetchVelorenServers } from "./providers/veloren";
import type { GameServer, ServerListResult, ServerProvider } from "./types";

async function fetchRemoteWithLobbyAuth(slug: string): Promise<GameServer[]> {
  const auth = await getServerLobbyAuth(slug);
  return fetchRemoteMaster(slug, auth);
}

const providers: Record<string, ServerProvider> = {
  openra: { slug: "openra", fetchServers: fetchOpenRaServers },
  luanti: { slug: "luanti", fetchServers: fetchLuantiServers },
  openttd: { slug: "openttd", fetchServers: fetchOpenTtdServers },
  veloren: { slug: "veloren", fetchServers: fetchVelorenServers },
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
    fetchServers: () => fetchRemoteMaster("battle-for-wesnoth"),
  },
  "warzone-2100": {
    slug: "warzone-2100",
    fetchServers: () => fetchRemoteMaster("warzone-2100"),
  },
  "zero-k": { slug: "zero-k", fetchServers: () => fetchRemoteWithLobbyAuth("zero-k") },
  "0ad": { slug: "0ad", fetchServers: () => fetchRemoteWithLobbyAuth("0ad") },
};

/** Slugs that support multiplayer servers but have no adapter yet. */
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
