import CommunityServer from "@/lib/models/CommunityServer";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { listManagedHostRooms } from "@/lib/gameHost/client";
import { managedQueryKind, queryManagedOccupancy } from "@/lib/communityHosting/playerQuery";
import { authorizeServer, recordActivity } from "./access";
import { createBackup } from "./backups";
import { restartServer } from "./servers";
import { maintenanceDue, maintenanceSettings, maintenanceWindowMatches, nextMaintenanceWindow } from "./maintenancePolicy";

export async function getMaintenance(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:view");
  if ("error" in auth) return auth;
  const value = auth.server.maintenance;
  return {
    enabled: value?.enabled === true, hourUTC: value?.hourUTC ?? 6, action: value?.action || "restart",
    daysUTC: value?.daysUTC ?? [0, 1, 2, 3, 4, 5, 6],
    lastDay: value?.lastDay || null, result: value?.result || null,
    lastCheckedAt: value?.lastCheckedAt?.toISOString() || null, lastCheckResult: value?.lastCheckResult || null,
    nextWindow: nextMaintenanceWindow(value, new Date()),
  };
}

export async function saveMaintenance(userId: string, serverId: string, input: unknown) {
  const auth = await authorizeServer(userId, serverId, "server:configure");
  if ("error" in auth) return auth;
  const settings = maintenanceSettings(input);
  if (!settings) return { error: "Choose an hour from 0 to 23 UTC and at least one day, with no duplicates.", status: 400 };
  const action = settings.action ?? auth.server.maintenance?.action ?? "restart";
  const actionAuth = await authorizeServer(userId, serverId, action === "configuration-backup" ? "server:create_backup" : "server:restart");
  if ("error" in actionAuth) return actionAuth;
  await CommunityServer.updateOne({ _id: serverId, ownerType: "user" }, { $set: {
    "maintenance.enabled": settings.enabled, "maintenance.hourUTC": settings.hourUTC,
    ...(settings.action === undefined ? {} : { "maintenance.action": settings.action }),
    "maintenance.changedBy": userId, "maintenance.changedAt": new Date(),
    "maintenance.lastCheckedAt": null, "maintenance.lastCheckResult": null,
    ...(settings.daysUTC === undefined ? {} : { "maintenance.daysUTC": settings.daysUTC }),
  } });
  await recordActivity(serverId, { id: userId }, "maintenance_changed", settings.enabled ? `${action === "configuration-backup" ? "Configuration backup" : "Empty-server restart"} at ${settings.hourUTC}:00 UTC; days ${settings.daysUTC?.join(",") ?? "unchanged"}` : "Scheduled maintenance disabled");
  return { ok: true };
}

/** Called after recovery. Claim the day's operation before any external side effect. */
export async function runMaintenance(serverId: string, now: Date) {
  const server = await CommunityServer.findOne({ _id: serverId, ownerType: "user" });
  if (!server || !maintenanceDue(server.maintenance, now)) return;
  const dayFilter = { $or: [{ "maintenance.daysUTC": { $exists: false } }, { "maintenance.daysUTC": now.getUTCDay() }] };
  if (server.maintenance?.action === "configuration-backup") {
    const day = now.toISOString().slice(0, 10);
    const claimed = await CommunityServer.findOneAndUpdate({
      _id: serverId, ownerType: "user", "maintenance.enabled": true,
      "maintenance.action": "configuration-backup", "maintenance.hourUTC": now.getUTCHours(),
      "maintenance.lastDay": { $ne: day }, ...dayFilter,
    }, { $set: { "maintenance.lastDay": day, "maintenance.result": "Preparing configuration backup", "maintenance.lastCheckedAt": now } }, { new: true });
    if (!claimed) return;
    let result = "Configuration backup failed. See Activity.";
    try {
      const backup = await createBackup(String(claimed.ownerId), serverId, "Scheduled configuration backup");
      if ("error" in backup) throw new Error(backup.error);
      result = "Configuration restore point saved. Server state unchanged.";
    } catch (error) { result = error instanceof Error ? error.message : result; }
    await CommunityServer.updateOne({ _id: serverId, "maintenance.lastDay": day }, { $set: { "maintenance.result": result, "maintenance.lastCheckResult": result } });
    await recordActivity(serverId, { kind: "system" }, "maintenance_ran", result);
    return;
  }
  if (server.desiredState !== "running" || (server.maintenance?.action && server.maintenance.action !== "restart")) return;
  const actionFilter = { $or: [{ "maintenance.action": "restart" }, { "maintenance.action": { $exists: false } }] };
  const noteCheck = async (message: string) => CommunityServer.updateOne({
    _id: serverId, ownerType: "user", desiredState: "running", "maintenance.enabled": true,
    "maintenance.hourUTC": now.getUTCHours(), "maintenance.lastDay": { $ne: now.toISOString().slice(0, 10) }, ...dayFilter,
  }, { $set: { "maintenance.lastCheckedAt": now, "maintenance.lastCheckResult": message } });
  const profile = await CommunityServerProfile.findOne({ key: server.profileKey }).lean();
  const queryKind = managedQueryKind(server.gameSlug, profile);
  if (!queryKind) { await noteCheck("Waiting: this game has no reliable player query."); return; }
  const agent = await listManagedHostRooms();
  if (!agent.ok) { await noteCheck("Waiting: game host unavailable."); return; }
  const room = agent.rooms.find(r => r.communityServerId === serverId && r.status !== "pending");
  if (!room) { await noteCheck("Waiting: no running server was confirmed."); return; }
  const occupancy = await queryManagedOccupancy({ queryKind, host: room.host, port: room.port, communityServerId: serverId }).catch(() => null);
  if (occupancy?.players !== 0) {
    await noteCheck(occupancy?.players == null ? "Waiting: player count is unknown." : "Waiting: players are online.");
    return; // Keep retrying within the window; never treat a failed query as empty.
  }

  const day = now.toISOString().slice(0, 10);
  const claimed = await CommunityServer.findOneAndUpdate({
    _id: serverId, ownerType: "user", desiredState: "running", runtimeId: room.roomId,
    "maintenance.enabled": true, "maintenance.hourUTC": now.getUTCHours(), "maintenance.lastDay": { $ne: day },
    $and: [dayFilter, actionFilter],
  }, { $set: { "maintenance.lastDay": day, "maintenance.result": "Preparing configuration backup", "maintenance.lastCheckedAt": now, "maintenance.lastCheckResult": "Preparing configuration backup" } }, { new: true });
  if (!claimed) return;
  let result = "Maintenance failed. See Activity.";
  try {
    const backup = await createBackup(String(claimed.ownerId), serverId, "Before scheduled restart");
    if ("error" in backup) throw new Error(backup.error);
    // Backup work may take time: query again immediately before the restart.
    const latest = await queryManagedOccupancy({ queryKind, host: room.host, port: room.port, communityServerId: serverId }).catch(() => null);
    const current = await CommunityServer.findById(serverId).lean();
    if (latest?.players !== 0 || !maintenanceWindowMatches(current?.maintenance, now) || (current?.maintenance?.action && current.maintenance.action !== "restart") || current?.desiredState !== "running" || current.runtimeId !== room.roomId) {
      result = "Skipped: players joined, state changed, or query unavailable.";
    } else {
      const restarted = await restartServer(String(claimed.ownerId), serverId);
      if ("error" in restarted) throw new Error(restarted.error);
      result = "Restart requested; configuration restore point saved.";
    }
  } catch (error) { result = error instanceof Error ? error.message : "Maintenance failed"; }
  await CommunityServer.updateOne({ _id: serverId, "maintenance.lastDay": day }, { $set: { "maintenance.result": result, "maintenance.lastCheckResult": result } });
  await recordActivity(serverId, { kind: "system" }, "maintenance_ran", result);
}
