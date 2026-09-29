/**
 * Keep customer servers where their owners asked them to be.
 *
 * Runs on the same VPS timer as the Community Server reconcile but separately
 * from it: that pass rotates, idles and downsizes free servers, and exits
 * early when automatic hosting is off. Paid servers take none of that. A
 * server whose owner wants it online is restarted if its room is gone; one
 * they stopped is stopped; a subscription that can no longer run takes its
 * servers down; and slots follow the rooms that actually exist.
 */
import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import { listManagedHostRooms, sendRoomCommand, stopManagedHostRoom } from "@/lib/gameHost/client";
import { managedQueryKind, queryManagedOccupancy } from "@/lib/communityHosting/playerQuery";
import { reconcileAllocations, releaseSlots, RUNNABLE_STATUSES } from "./entitlement";
import { launchRoom } from "./servers";
import { recordActivity } from "./access";
import { applyLiveState } from "./liveControl";
import { automaticBackups } from "./backups";
import { parseCurrentMap } from "@/lib/serverControl/rcon";
import { getServerSettingProfile } from "@/lib/serverControl/settings";
import { getTier } from "./tier";
import { reconcileDedicatedCapacityReservations } from "./reservations";

const MAX_BACKOFF_MINUTES = 30;

export async function reconcileDedicatedServers(now = new Date()) {
  await dbConnect();
  await reconcileDedicatedCapacityReservations(now).catch((error) => {
    // The subscription is still counted directly by inventory and free-hosting
    // reservation logic. A mirror write failure must not stop paid recovery.
    console.warn("[dedicated-hosting] reservation reconciliation failed:", error instanceof Error ? error.message : error);
  });
  const agent = await listManagedHostRooms();
  if (!agent.ok) return { action: "waiting", reason: agent.error };
  const rooms = new Map(agent.rooms.filter((r) => r.communityServerId).map((r) => [r.communityServerId!, r]));

  const servers = await CommunityServer.find({
    ownerType: "user",
    $or: [{ desiredState: "running" }, { slotsHeld: true }, { runtimeState: { $in: ["running", "pending"] } }],
  });
  if (!servers.length) {
    await reconcileAllocations();
    return { action: "idle" };
  }
  const subIds = [...new Set(servers.map((s) => String(s.dedicatedSubscriptionId)))];
  const subs = await DedicatedSubscription.find({ _id: { $in: subIds } }).lean();
  const subById = new Map(subs.map((s) => [String(s._id), s]));
  const profiles = await CommunityServerProfile.find({ key: { $in: [...new Set(servers.map((s) => s.profileKey))] } }).lean();
  const profileByKey = new Map(profiles.map((p) => [p.key, p]));
  const tier = await getTier();

  let recovered = 0;
  let stopped = 0;
  for (const server of servers) {
    const id = String(server._id);
    const room = rooms.get(id);
    const sub = subById.get(String(server.dedicatedSubscriptionId));
    const runnable = Boolean(sub && (RUNNABLE_STATUSES as readonly string[]).includes(String(sub.status)));
    const wantOnline = server.desiredState === "running" && runnable && !tier.startsDisabled;

    if (!wantOnline) {
      if (room) {
        const res = await stopManagedHostRoom(id);
        if (!res.ok) continue; // Try again next pass; keep the slots until the room is gone.
      }
      // Only a stop PlayBound decided is logged here; an owner's stop was logged when they asked.
      const forced = server.desiredState === "running";
      if (forced) {
        server.desiredState = "stopped";
        server.decisionReason = runnable ? "STARTS_DISABLED" : "SUBSCRIPTION_INACTIVE";
      }
      server.runtimeState = "stopped";
      server.playerCount = null;
      server.host = null;
      server.port = null;
      server.onlineSince = null;
      await server.save();
      await releaseSlots(id);
      if (forced) {
        await recordActivity(server._id, { kind: "system" }, "server_stopped", runnable ? "Server starts are paused" : "Hosting subscription is not active");
      }
      stopped += 1;
      continue;
    }

    if (room) {
      const profile = profileByKey.get(server.profileKey);
      const queryKind = managedQueryKind(server.gameSlug, profile);
      const occupancy = queryKind
        ? await queryManagedOccupancy({ queryKind, host: room.host, port: room.port, communityServerId: id }).catch(() => null)
        : null;
      if (server.runtimeId !== room.roomId) server.onlineSince = now;
      server.runtimeId = room.roomId;
      server.host = room.host;
      server.port = room.port;
      server.runtimeState = "running";
      server.playerCount = occupancy?.players ?? null;
      server.bots = occupancy?.bots ?? null;
      server.maxPlayerCount = server.allocatedSlots;
      server.health = occupancy ? "healthy" : "unknown";
      server.playerCountCheckedAt = occupancy ? now : null;
      if ((occupancy?.players ?? 0) > 0) server.lastOccupiedAt = now;
      server.recoveryAttempts = 0;
      server.nextRecoveryAt = null;
      server.lastReconciledAt = now;
      // What it is playing, for listings and the public page.
      const channel = getServerSettingProfile(server.gameSlug)?.controlChannel;
      if (channel) {
        const status = await sendRoomCommand(room.roomId, "status").catch(() => null);
        if (status?.ok) server.currentMap = parseCurrentMap(channel, status.response) || server.currentMap;
      }
      // A new room has not had this server's bans and rotation yet.
      if (server.liveStateRoomId !== room.roomId && (await applyLiveState(server, room.roomId).catch(() => false))) {
        server.liveStateRoomId = room.roomId;
      }
      await server.save();
      continue;
    }

    if (agent.jobs[id]?.status === "pending") {
      server.runtimeState = "pending";
      await server.save();
      continue;
    }

    // Wanted online, no room: it crashed or the host restarted. Bring it back, with backoff.
    if (server.nextRecoveryAt && server.nextRecoveryAt > now) continue;
    const attempts = (server.recoveryAttempts || 0) + 1;
    const result = await launchRoom(server);
    server.recoveryAttempts = attempts;
    server.nextRecoveryAt = new Date(now.getTime() + Math.min(2 ** attempts, MAX_BACKOFF_MINUTES) * 60_000);
    server.runtimeState = result.status === "failed" ? "failed" : "pending";
    server.health = "unhealthy";
    server.decisionReason = result.status === "failed" ? `RECOVERY_FAILED: ${result.error || "unknown"}` : "RECOVERING";
    await server.save();
    await recordActivity(server._id, { kind: "system" }, "server_recovered", result.status === "failed" ? `Restart attempt ${attempts} failed: ${result.error || "unknown"}` : `Server was down; restarting (attempt ${attempts})`);
    recovered += 1;
  }

  const fixed = await reconcileAllocations();
  const backups = await automaticBackups(now).catch((err) => {
    console.warn("[dedicated-hosting] automatic backups failed:", err instanceof Error ? err.message : err);
    return 0;
  });
  return { action: "reconciled", recovered, stopped, allocationFixes: fixed, backups };
}

/**
 * CPU/RAM owed to paid subscriptions in a region, whether or not their servers
 * are running. Automatic Community Servers get only what is left: paid
 * capacity is reserved capacity.
 */
export async function paidReservedEnvelope(regionKey: string): Promise<{ cpuCores: number; ramBytes: number }> {
  await dbConnect();
  const [subs, holds] = await Promise.all([DedicatedSubscription.find({ regionKey, status: { $in: ["active", "past_due", "suspended"] } })
    .select({ slotCapacity: 1, tier: 1 })
    .lean(), DedicatedCapacityHold.find({ regionKey, state: "held", expiresAt: { $gt: new Date() } }).select({ slots: 1 }).lean()]);
  if (!subs.length && !holds.length) return { cpuCores: 0, ramBytes: 0 };
  const tier = await getTier();
  const rc = tier.resourceClass;
  const units = subs.reduce((sum, s) => sum + Math.ceil(Number(s.slotCapacity) / Math.max(1, rc.slotsPerUnit)), 0) +
    holds.reduce((sum, h) => sum + Math.ceil(Number(h.slots) / Math.max(1, rc.slotsPerUnit)), 0);
  return { cpuCores: units * rc.cpuPerUnit, ramBytes: units * rc.memoryMbPerUnit * 1024 * 1024 };
}
