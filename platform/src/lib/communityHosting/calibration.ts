import dbConnect from "@/lib/db";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import CommunityServer from "@/lib/models/CommunityServer";
import ServerResourceCalibration from "@/lib/models/ServerResourceCalibration";
import ServerResourceSample from "@/lib/models/ServerResourceSample";
import { fetchGameHostMetrics, listManagedHostRooms } from "@/lib/gameHost/client";
import { managedQueryKind, queryManagedOccupancy } from "./playerQuery";
import { recordResourceSample } from "./samples";

export async function resetResourceCalibration(actorId: string, requestId: string) {
  const db = await dbConnect();
  await ServerResourceCalibration.init();
  const session = await db.startSession();
  try {
    return await session.withTransaction(async () => {
      const existing = await ServerResourceCalibration.findOne({ requestId }).session(session).lean();
      if (existing) return { profiles: existing.profiles.length, resetAt: existing.resetAt, repeated: true };
      const profiles = await CommunityServerProfile.find({}).select({
        key: 1, envelope: 1, candidateEnvelope: 1, sampleCount: 1, lastSampleAt: 1, baselineVersion: 1,
        measurementResetAt: 1, measurementResetBy: 1,
      }).session(session).lean();
      const resetAt = new Date();
      await ServerResourceCalibration.create([{ requestId, actorId, resetAt, profiles }], { session });
      if (profiles.length) await CommunityServerProfile.bulkWrite(profiles.map((profile) => ({ updateOne: {
        filter: { _id: profile._id },
        update: { $set: {
          envelope: { cpuCores: 0, ramBytes: 0, measuredThroughPlayers: 0 },
          candidateEnvelope: { cpuCores: 0, ramBytes: 0, measuredThroughPlayers: 0 },
          sampleCount: 0, lastSampleAt: null, baselineVersion: (profile.baselineVersion || 1) + 1,
          measurementResetAt: resetAt, measurementResetBy: actorId,
        } },
      } })), { session });
      const removed = profiles.length ? await ServerResourceSample.deleteMany({
        profileKey: { $in: profiles.map((profile) => profile.key) }, observedAt: { $lte: resetAt },
      }).session(session) : { deletedCount: 0 };
      // Only obsolete resource samples are removed, after the summaries are
      // archived in the same transaction. All other collections stay untouched.
      return { profiles: profiles.length, removedSamples: removed.deletedCount, resetAt, repeated: false };
    });
  } finally { await session.endSession(); }
}

/** Sample existing runtimes only. Never start, stop or modify a game server. */
export async function sampleRunningResourceUsage() {
  await dbConnect();
  const [agent, node] = await Promise.all([listManagedHostRooms(), fetchGameHostMetrics()]);
  if (!agent.ok || !node.ok) throw new Error("VPS measurements unavailable");
  const now = new Date();
  const metricAge = now.getTime() - Date.parse(node.metrics.collectedAt || "");
  if (!Number.isFinite(metricAge) || metricAge < -60_000 || metricAge > 60_000) throw new Error("VPS measurements stale");
  const profiles = await CommunityServerProfile.find({}).lean();
  const byKey = new Map(profiles.map((profile) => [profile.key, profile]));
  const servers = await CommunityServer.find({ _id: { $in: agent.rooms.map((room) => room.communityServerId).filter(Boolean) } }).lean();
  const byId = new Map(servers.map((server) => [String(server._id), server]));
  let recorded = 0;
  for (const room of agent.rooms) {
    const server = byId.get(String(room.communityServerId));
    const profile = server && byKey.get(server.profileKey);
    const resources = room.resources;
    if (!server || !profile || !resources?.available || resources.cpuCores == null || !resources.rssBytes) continue;
    const queryKind = managedQueryKind(server.gameSlug, profile);
    if (!queryKind) continue;
    const occupancy = await queryManagedOccupancy({
      queryKind, host: room.host, port: room.port,
      communityServerId: String(server._id), expectedMod: server.mod || undefined,
    });
    const observedAt = new Date(resources.collectedAt || now);
    if (await recordResourceSample({
      profileKey: profile.key, communityServerId: String(server._id), observedAt,
      players: occupancy?.players ?? null, cpuCores: resources.cpuCores, ramBytes: resources.rssBytes,
      phase: occupancy?.players ? "occupied" : "idle", source: "live",
      scope: resources.scope, sampleIntervalMs: resources.sampleIntervalMs,
      runtimeAgeMs: room.processStartedAt ? observedAt.getTime() - room.processStartedAt : undefined,
      nodeCpuCores: node.metrics.cpu?.cores, nodeCpuPercent: node.metrics.cpu?.usagePercent,
      nodeRamPercent: node.metrics.memory?.usedPercent,
    })) recorded++;
  }
  return { recorded, running: agent.rooms.length };
}
