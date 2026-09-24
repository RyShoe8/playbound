import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
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
        gameSlug: slug, desiredState: "running", runtimeState: "running", health: "healthy",
        playerCount: { $ne: null }, playerCountCheckedAt: { $gte: freshSince },
        lastReconciledAt: { $gte: freshSince }, host: { $nin: [null, ""] }, port: { $gt: 0 },
      }).lean();
    return servers.map((server) => ({
      id: `playbound:${server._id}`,
      sourceType: "playbound_hosted" as const,
      communityServerId: String(server._id),
      editionSlug: server.editionSlug || null,
      name: server.name,
      host: server.host as string,
      port: server.port as number,
      players: server.playerCount as number,
      maxPlayers: null,
      map: null,
      gameType: server.editionSlug || null,
      mod: server.mod || null,
      location: { countryCode: "US", region: config.node.regionLabel || server.regionKey },
      protected: false,
    }));
  } catch (error) {
    console.warn("[community-hosting] discovery unavailable:", error instanceof Error ? error.message : error);
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
