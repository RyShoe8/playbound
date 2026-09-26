import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import { listGames } from "@/lib/catalog";
import type { GameServer } from "@/lib/servers/types";
import { unstable_cache } from "next/cache";
import { listManagedHostRooms, type GameHostRoom } from "@/lib/gameHost/client";

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

    const [dbServers, agentResult] = await Promise.all([
      CommunityServer.find({
        gameSlug: slug,
        desiredState: "running",
        runtimeState: { $in: ["running", "pending", "starting"] },
        host: { $nin: [null, ""] },
        port: { $gt: 0 },
      }).lean(),
      listManagedHostRooms().catch(() => null),
    ]);

    const agentRoomById = new Map<string, GameHostRoom>();
    if (agentResult && agentResult.ok) {
      for (const room of agentResult.rooms) {
        if (room.communityServerId) {
          agentRoomById.set(String(room.communityServerId), room);
        }
      }
    }

    const seenIds = new Set<string>();
    const result: GameServer[] = [];

    for (const server of dbServers) {
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
      const idStr = String(s._id);
      seenIds.add(idStr);

      const agentRoom = agentRoomById.get(idStr);
      const host = agentRoom?.host || s.host;
      const port = agentRoom?.port || s.port;
      const configuredLimit = typeof s.settings?.playerLimit === "number" ? s.settings.playerLimit : null;

      result.push({
        id: `playbound:${s._id}`,
        sourceType: "playbound_hosted" as const,
        communityServerId: idStr,
        gameSlug: slug,
        editionSlug: s.editionSlug || null,
        name: s.name,
        host,
        port,
        players: s.playerCount,
        maxPlayers: s.maxPlayerCount ?? configuredLimit,
        bots: s.bots ?? null,
        map: null,
        gameType: s.editionSlug || null,
        mod: s.mod || null,
        location: { countryCode: "US", region: config.node?.regionLabel || s.regionKey },
        protected: false,
      });
    }

    // Merge any live agent rooms for this gameSlug that might not be in the DB query
    if (agentResult && agentResult.ok) {
      for (const room of agentResult.rooms) {
        if (room.gameSlug !== slug) continue;
        const idStr = room.communityServerId ? String(room.communityServerId) : room.roomId;
        if (seenIds.has(idStr)) continue;
        if (!room.host || !room.port) continue;
        seenIds.add(idStr);

        result.push({
          id: `playbound:${idStr}`,
          sourceType: "playbound_hosted" as const,
          communityServerId: idStr,
          gameSlug: slug,
          editionSlug: null,
          name: room.name || `${slug} Dedicated Server`,
          host: room.host,
          port: room.port,
          players: null,
          maxPlayers: typeof room.settings?.maxPlayers === "number" ? room.settings.maxPlayers : null,
          bots: typeof room.settings?.botFill === "number" ? room.settings.botFill : null,
          map: null,
          gameType: null,
          mod: null,
          location: { countryCode: "US", region: config.node?.regionLabel || "US Central" },
          protected: false,
        });
      }
    }

    return result;
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

    const [dbServers, agentResult, games] = await Promise.all([
      CommunityServer.find({
        desiredState: "running",
        runtimeState: { $in: ["running", "pending", "starting"] },
        host: { $nin: [null, ""] },
        port: { $gt: 0 },
      }).lean(),
      listManagedHostRooms().catch(() => null),
      listGames().catch(() => []),
    ]);

    const gameBySlug = new Map(games.map((g) => [g.slug, g]));
    const agentRoomById = new Map<string, GameHostRoom>();
    if (agentResult && agentResult.ok) {
      for (const room of agentResult.rooms) {
        if (room.communityServerId) {
          agentRoomById.set(String(room.communityServerId), room);
        }
      }
    }

    const seenIds = new Set<string>();
    const result: GameServer[] = [];

    for (const server of dbServers) {
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
      const idStr = String(s._id);
      seenIds.add(idStr);

      const agentRoom = agentRoomById.get(idStr);
      const host = agentRoom?.host || s.host;
      const port = agentRoom?.port || s.port;
      const game = gameBySlug.get(s.gameSlug);
      const configuredLimit = typeof s.settings?.playerLimit === "number" ? s.settings.playerLimit : null;

      result.push({
        id: `playbound:${s._id}`,
        sourceType: "playbound_hosted" as const,
        communityServerId: idStr,
        gameSlug: s.gameSlug,
        gameTitle: game?.title || s.gameSlug,
        editionSlug: s.editionSlug || null,
        name: s.name,
        host,
        port,
        players: s.playerCount,
        maxPlayers: s.maxPlayerCount ?? configuredLimit,
        bots: s.bots ?? null,
        map: null,
        gameType: s.editionSlug || null,
        mod: s.mod || null,
        location: { countryCode: "US", region: config.node?.regionLabel || s.regionKey },
        protected: false,
      });
    }

    // Merge any live agent rooms that might not be in the DB query
    if (agentResult && agentResult.ok) {
      for (const room of agentResult.rooms) {
        const idStr = room.communityServerId ? String(room.communityServerId) : room.roomId;
        if (seenIds.has(idStr)) continue;
        if (!room.host || !room.port) continue;
        seenIds.add(idStr);

        const game = gameBySlug.get(room.gameSlug);
        result.push({
          id: `playbound:${idStr}`,
          sourceType: "playbound_hosted" as const,
          communityServerId: idStr,
          gameSlug: room.gameSlug,
          gameTitle: game?.title || room.gameSlug,
          editionSlug: null,
          name: room.name || `${game?.title || room.gameSlug} Dedicated Server`,
          host: room.host,
          port: room.port,
          players: null,
          maxPlayers: typeof room.settings?.maxPlayers === "number" ? room.settings.maxPlayers : null,
          bots: typeof room.settings?.botFill === "number" ? room.settings.botFill : null,
          map: null,
          gameType: null,
          mod: null,
          location: { countryCode: "US", region: config.node?.regionLabel || "US Central" },
          protected: false,
        });
      }
    }

    return result;
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
    const server = await CommunityServer.findOne({
      linkedEventId: eventId,
      desiredState: "running",
      runtimeState: { $in: ["running", "pending", "starting"] },
      health: { $ne: "unhealthy" },
      host: { $nin: [null, ""] },
      port: { $gt: 0 },
    }).select({ host: 1, port: 1, name: 1, mod: 1 }).lean();
    return server ? { host: server.host as string, port: server.port as number, name: server.name, mod: server.mod || null } : null;
  } catch {
    return null;
  }
}
