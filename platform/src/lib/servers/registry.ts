import { fetchLuantiServers } from "./providers/luanti";
import { fetchOpenRaServers } from "./providers/openra";
import { fetchRemoteMaster } from "./providers/remote";
import { fetchSuperTuxKartServers } from "./providers/supertuxkart";
import type { GameServer, ServerListResult, ServerProvider } from "./types";

const providers: Record<string, ServerProvider> = {
  openra: { slug: "openra", fetchServers: fetchOpenRaServers },
  luanti: { slug: "luanti", fetchServers: fetchLuantiServers },
  supertuxkart: { slug: "supertuxkart", fetchServers: fetchSuperTuxKartServers },
  xonotic: { slug: "xonotic", fetchServers: () => fetchRemoteMaster("xonotic") },
  unvanquished: { slug: "unvanquished", fetchServers: () => fetchRemoteMaster("unvanquished") },
};

/** Slugs that support multiplayer servers but have no adapter yet. */
export const UNSUPPORTED_SERVER_SLUGS = [
  "openttd",
  "0ad",
  "veloren",
  "beyond-all-reason",
  "zero-k",
  "hedgewars",
  "battle-for-wesnoth",
  "warzone-2100",
  "mindustry",
] as const;

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
