import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import { listGames } from "@/lib/catalog";
import type { GameServer } from "@/lib/servers/types";
import { unstable_cache } from "next/cache";

function hasDatabase(): boolean {
  const uri = process.env.MONGODB_URI;
  return Boolean(uri && uri !== "[SENSITIVE]" && (uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://")));
}

const discoveryConfig = unstable_cache(async () => {
  await dbConnect();
  return CommunityHostingConfig.findOne({ key: "global" }).select({ enabled: 1, node: 1 }).lean();
}, ["community-hosting-discovery-config-v1"], { revalidate: 60 });

export async function listJoinableCommunityServers(slug: string): Promise<GameServer[]> {
  if (!hasDatabase()) return [];
  try {
    const config = await discoveryConfig();
    if (!config?.enabled) return [];
    await dbConnect();
    const freshSince = new Date(Date.now() - 30 * 60_000);
    const servers = await CommunityServer.find({
        gameSlug: slug, desiredState: "running", runtimeState: "running",
        lastReconciledAt: { $gte: freshSince }, host: { $nin: [null, ""] }, port: { $gt: 0 },
      }).lean();
    return servers.map((server) => {
      const s = server as {
        _id: unknown;
        name: string;
        host: string;
        port: number;
        playerCount: number | null;
        maxPlayerCount?: number | null;
        bots?: number | null;
        editionSlug?: string | null;
        mod?: string | null;
        regionKey: string;
        settings?: { playerLimit?: number };
      };
      const configuredLimit = typeof s.settings?.playerLimit === "number" ? s.settings.playerLimit : null;
      return {
        id: `playbound:${s._id}`,
        sourceType: "playbound_hosted" as const,
        communityServerId: String(s._id),
        gameSlug: slug,
        editionSlug: s.editionSlug || null,
        name: s.name,
        host: s.host,
        port: s.port,
        players: s.playerCount,
        maxPlayers: s.maxPlayerCount ?? configuredLimit,
        bots: s.bots ?? null,
        map: null,
        gameType: s.editionSlug || null,
        mod: s.mod || null,
        location: { countryCode: "US", region: config.node.regionLabel || s.regionKey },
        protected: false,
      };
    });
  } catch (error) {
    console.warn("[community-hosting] discovery unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function listAllJoinableCommunityServers(): Promise<GameServer[]> {
  if (!hasDatabase()) return [];
  try {
    const config = await discoveryConfig();
    if (!config?.enabled) return [];
    await dbConnect();
    const freshSince = new Date(Date.now() - 30 * 60_000);
    const servers = await CommunityServer.find({
      desiredState: "running",
      runtimeState: "running",
      lastReconciledAt: { $gte: freshSince },
      host: { $nin: [null, ""] },
      port: { $gt: 0 },
    }).lean();

    const games = await listGames().catch(() => []);
    const gameBySlug = new Map(games.map((g) => [g.slug, g]));

    return servers.map((server) => {
      const s = server as {
        _id: unknown;
        gameSlug: string;
        name: string;
        host: string;
        port: number;
        playerCount: number | null;
        maxPlayerCount?: number | null;
        bots?: number | null;
        editionSlug?: string | null;
        mod?: string | null;
        regionKey: string;
        settings?: { playerLimit?: number };
      };
      const game = gameBySlug.get(s.gameSlug);
      const configuredLimit = typeof s.settings?.playerLimit === "number" ? s.settings.playerLimit : null;
      return {
        id: `playbound:${s._id}`,
        sourceType: "playbound_hosted" as const,
        communityServerId: String(s._id),
        gameSlug: s.gameSlug,
        gameTitle: game?.title || s.gameSlug,
        editionSlug: s.editionSlug || null,
        name: s.name,
        host: s.host,
        port: s.port,
        players: s.playerCount,
        maxPlayers: s.maxPlayerCount ?? configuredLimit,
        bots: s.bots ?? null,
        map: null,
        gameType: s.editionSlug || null,
        mod: s.mod || null,
        location: { countryCode: "US", region: config.node.regionLabel || s.regionKey },
        protected: false,
      };
    });
  } catch (error) {
    console.warn("[community-hosting] list all discovery unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function joinableServerForEvent(eventId: string): Promise<{
  host: string; port: number; name: string; mod: string | null;
} | null> {
  if (!hasDatabase()) return null;
  try {
    const config = await discoveryConfig();
    if (!config?.enabled) return null;
    await dbConnect();
    const freshSince = new Date(Date.now() - 30 * 60_000);
    const server = await CommunityServer.findOne({
      linkedEventId: eventId, runtimeState: "running", health: "healthy",
      playerCountCheckedAt: { $gte: freshSince }, lastReconciledAt: { $gte: freshSince },
      host: { $nin: [null, ""] }, port: { $gt: 0 },
    }).select({ host: 1, port: 1, name: 1, mod: 1 }).lean();
    return server ? { host: server.host as string, port: server.port as number, name: server.name, mod: server.mod || null } : null;
  } catch {
    return null;
  }
}
