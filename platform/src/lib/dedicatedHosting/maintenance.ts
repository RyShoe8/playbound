import CommunityServer from "@/lib/models/CommunityServer";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { listManagedHostRooms } from "@/lib/gameHost/client";
import { managedQueryKind, queryManagedOccupancy } from "@/lib/communityHosting/playerQuery";
import { authorizeServer, recordActivity } from "./access";
import { createBackup } from "./backups";
import { restartServer } from "./servers";
import { maintenanceDue, maintenanceSettings } from "./maintenancePolicy";

export async function getMaintenance(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:view");
  if ("error" in auth) return auth;
  const value = auth.server.maintenance;
  return { enabled: value?.enabled === true, hourUTC: value?.hourUTC ?? 6, lastDay: value?.lastDay || null, result: value?.result || null };
}

export async function saveMaintenance(userId: string, serverId: string, input: unknown) {
  const auth = await authorizeServer(userId, serverId, "server:configure");
  if ("error" in auth) return auth;
  const restartAuth = await authorizeServer(userId, serverId, "server:restart");
  if ("error" in restartAuth) return restartAuth;
  const settings = maintenanceSettings(input);
  if (!settings) return { error: "Choose an hour from 0 to 23 UTC and whether maintenance is enabled.", status: 400 };
  await CommunityServer.updateOne({ _id: serverId, ownerType: "user" }, { $set: {
    "maintenance.enabled": settings.enabled, "maintenance.hourUTC": settings.hourUTC,
    "maintenance.changedBy": userId, "maintenance.changedAt": new Date(),
  } });
  await recordActivity(serverId, { id: userId }, "maintenance_changed", settings.enabled ? `Daily empty-server restart at ${settings.hourUTC}:00 UTC` : "Daily restart disabled");
  return { ok: true };
}

/** Called after recovery. Claim the day's operation before any external side effect. */
export async function runMaintenance(serverId: string, now: Date) {
  const server = await CommunityServer.findOne({ _id: serverId, ownerType: "user", desiredState: "running" });
  if (!server || !maintenanceDue(server.maintenance, now)) return;
  const profile = await CommunityServerProfile.findOne({ key: server.profileKey }).lean();
  const queryKind = managedQueryKind(server.gameSlug, profile);
  if (!queryKind) return;
  const agent = await listManagedHostRooms();
  if (!agent.ok) return;
  const room = agent.rooms.find(r => r.communityServerId === serverId && r.status !== "pending");
  if (!room) return;
  const occupancy = await queryManagedOccupancy({ queryKind, host: room.host, port: room.port, communityServerId: serverId }).catch(() => null);
  if (occupancy?.players !== 0) return; // Failed queries never count as empty.

  const day = now.toISOString().slice(0, 10);
  const claimed = await CommunityServer.findOneAndUpdate({
    _id: serverId, ownerType: "user", desiredState: "running", runtimeId: room.roomId,
    "maintenance.enabled": true, "maintenance.hourUTC": now.getUTCHours(), "maintenance.lastDay": { $ne: day },
  }, { $set: { "maintenance.lastDay": day, "maintenance.result": "Preparing configuration backup" } }, { new: true });
  if (!claimed) return;
  let result = "Maintenance failed. See Activity.";
  try {
    const backup = await createBackup(String(claimed.ownerId), serverId, "Before scheduled restart");
    if ("error" in backup) throw new Error(backup.error);
    // Backup work may take time: query again immediately before the restart.
    const latest = await queryManagedOccupancy({ queryKind, host: room.host, port: room.port, communityServerId: serverId }).catch(() => null);
    const current = await CommunityServer.findById(serverId).lean();
    if (latest?.players !== 0 || !current?.maintenance?.enabled || current.desiredState !== "running" || current.runtimeId !== room.roomId) {
      result = "Skipped: players joined, state changed, or query unavailable.";
    } else {
      const restarted = await restartServer(String(claimed.ownerId), serverId);
      if ("error" in restarted) throw new Error(restarted.error);
      result = "Restart requested; configuration restore point saved.";
    }
  } catch (error) { result = error instanceof Error ? error.message : "Maintenance failed"; }
  await CommunityServer.updateOne({ _id: serverId, "maintenance.lastDay": day }, { $set: { "maintenance.result": result } });
  await recordActivity(serverId, { kind: "system" }, "maintenance_ran", result);
}
