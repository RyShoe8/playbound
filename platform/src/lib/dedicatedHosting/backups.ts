/**
 * Restore points for customer servers.
 *
 * A backup is the server's PlayBound configuration (see models/ServerBackup).
 * The tier's `backupRetention` (3 for Basic) caps how many a server keeps;
 * the oldest goes first. Restoring first takes a "before-restore" point of the
 * current state, so a restore can itself be undone.
 */
import { createHash } from "crypto";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import CatalogGame from "@/lib/models/CatalogGame";
import ServerBackup from "@/lib/models/ServerBackup";
import { authorizeServer, recordActivity, type Fail } from "./access";
import { allowedSlotSizes, getTier, tierGame } from "./tier";

type ServerLike = {
  _id: unknown;
  name: string;
  description?: string;
  visibility?: string;
  allocatedSlots: number;
  settings?: Record<string, unknown> | null;
  mapRotation?: string[];
  bans?: Array<{ name: string; address: string; at?: Date }>;
  access?: Array<{ userId: unknown; role: string }>;
  dedicatedSubscriptionId?: unknown;
  profileKey: string;
};

export function snapshotOf(s: ServerLike) {
  return {
    name: s.name,
    description: s.description || "",
    visibility: s.visibility || "public",
    slots: s.allocatedSlots,
    settings: s.settings || {},
    mapRotation: [...(s.mapRotation || [])],
    bans: (s.bans || []).map((b) => ({ name: b.name, address: b.address, at: b.at ? new Date(b.at).toISOString() : null })),
    access: (s.access || []).map((a) => ({ userId: String(a.userId), role: a.role })),
  };
}

export type Snapshot = ReturnType<typeof snapshotOf>;

export function snapshotHash(snap: Snapshot): string {
  const stable = JSON.stringify(snap, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v
  );
  return createHash("sha256").update(stable).digest("hex");
}

export async function retentionFor(server: ServerLike): Promise<number> {
  const sub = await DedicatedSubscription.findById(server.dedicatedSubscriptionId).select({ tier: 1 }).lean();
  return (await getTier(sub?.tier || "basic")).backupRetention;
}

/** Store a restore point and prune past the tier's retention. */
async function writeBackup(server: ServerLike, kind: "manual" | "automatic" | "before-restore", createdBy: string | null, label?: string | null) {
  const snapshot = snapshotOf(server);
  const doc = await ServerBackup.create({
    serverId: server._id,
    kind,
    label: label ? String(label).slice(0, 80) : null,
    createdBy: createdBy && Types.ObjectId.isValid(createdBy) ? createdBy : null,
    hash: snapshotHash(snapshot),
    snapshot,
  });
  const keep = Math.max(1, await retentionFor(server));
  const stale = await ServerBackup.find({ serverId: server._id }).sort({ createdAt: -1 }).skip(keep).select({ _id: 1 }).lean();
  if (stale.length) await ServerBackup.deleteMany({ _id: { $in: stale.map((b) => b._id) } });
  return doc;
}

/** Backups for the Backups tab. */
export async function listBackups(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:view");
  if ("error" in auth) return auth;
  const rows = await ServerBackup.find({ serverId }).sort({ createdAt: -1 }).lean();
  const retention = await retentionFor(auth.server);
  return {
    retention,
    backups: rows.map((b) => ({
      id: String(b._id),
      kind: b.kind,
      label: b.label || null,
      at: b.createdAt,
      summary: summarize(b.snapshot as Snapshot),
    })),
    status: 200 as const,
  };
}

function summarize(s: Snapshot) {
  return `${s.name} · ${s.slots} slots · ${Object.keys(s.settings || {}).length} settings · ${s.mapRotation.length} maps in rotation · ${s.bans.length} bans · ${s.access.length} people`;
}

export async function createBackup(userId: string, serverId: string, label?: unknown) {
  const auth = await authorizeServer(userId, serverId, "server:create_backup");
  if ("error" in auth) return auth;
  const doc = await writeBackup(auth.server, "manual", userId, typeof label === "string" ? label : null);
  await recordActivity(serverId, { id: userId }, "backup_created", doc.label || null);
  return { ok: true as const, id: String(doc._id), status: 200 as const };
}

export async function deleteBackup(userId: string, serverId: string, backupId: string) {
  const auth = await authorizeServer(userId, serverId, "server:restore_backup");
  if ("error" in auth) return auth;
  if (!Types.ObjectId.isValid(backupId)) return { error: "No such restore point.", status: 404 } satisfies Fail;
  const res = await ServerBackup.deleteOne({ _id: backupId, serverId });
  if (!res.deletedCount) return { error: "No such restore point.", status: 404 } satisfies Fail;
  await recordActivity(serverId, { id: userId }, "backup_deleted");
  return { ok: true as const, status: 200 as const };
}

/**
 * Put a restore point back. The size only changes while the server is stopped
 * (a running server holds its slots); game settings that only apply at start
 * take effect at the next restart, and bans and rotation are re-sent to the
 * running server by reconcile.
 */
export async function restoreBackup(userId: string, serverId: string, backupId: string) {
  const auth = await authorizeServer(userId, serverId, "server:restore_backup");
  if ("error" in auth) return auth;
  if (!Types.ObjectId.isValid(backupId)) return { error: "No such restore point.", status: 404 } satisfies Fail;
  const backup = await ServerBackup.findOne({ _id: backupId, serverId }).lean();
  if (!backup) return { error: "No such restore point.", status: 404 } satisfies Fail;
  const snap = backup.snapshot as Snapshot;
  const server = auth.server;

  await writeBackup(server, "before-restore", userId, "Before restore");

  const notes: string[] = [];
  server.name = snap.name;
  server.description = snap.description;
  server.visibility = snap.visibility;
  server.settings = snap.settings;
  server.mapRotation = snap.mapRotation;
  server.bans = snap.bans.map((b) => ({ name: b.name, address: b.address, at: b.at ? new Date(b.at) : new Date() }));
  // Access: only the owner may change who has a role.
  if (auth.role === "owner") {
    server.access = snap.access
      .filter((a) => Types.ObjectId.isValid(a.userId) && a.userId !== String(server.ownerId))
      .map((a) => ({ userId: a.userId, role: a.role, grantedBy: userId, grantedAt: new Date() }));
  } else if (JSON.stringify(snap.access) !== JSON.stringify(snapshotOf(server).access)) {
    notes.push("Roles were left as they are: only the owner can restore who has access.");
  }
  if (snap.slots !== server.allocatedSlots) {
    const sub = await DedicatedSubscription.findById(server.dedicatedSubscriptionId).lean();
    const tier = await getTier(sub?.tier || "basic");
    const game = tierGame(tier, server.profileKey);
    const catalogGame = await CatalogGame.findOne({ slug: server.gameSlug }).select("maxPlayers").lean();
    if (server.slotsHeld || server.desiredState === "running") notes.push(`Size kept at ${server.allocatedSlots} slots: stop the server to restore ${snap.slots}.`);
    else if (!game || !allowedSlotSizes(tier, game, sub?.slotCapacity || 0, catalogGame?.maxPlayers).includes(snap.slots)) notes.push(`Size kept at ${server.allocatedSlots} slots: ${snap.slots} is no longer offered.`);
    else server.allocatedSlots = snap.slots;
  }
  // Bans and rotation go to the running room on the next reconcile.
  server.liveStateRoomId = null;
  await server.save();
  await recordActivity(serverId, { id: userId }, "backup_restored", backup.label || new Date(backup.createdAt as Date).toLocaleString("en-US"));
  if (server.desiredState === "running") notes.push("Settings that only apply at start take effect when the server next restarts.");
  return { ok: true as const, notes, status: 200 as const };
}

/** The configuration as a download. Banned players' addresses are left out. */
export async function exportServer(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:configure");
  if ("error" in auth) return auth;
  const snap = snapshotOf(auth.server);
  return {
    file: {
      format: "playbound-dedicated-server",
      version: 1,
      exportedAt: new Date().toISOString(),
      game: { gameSlug: auth.server.gameSlug, editionSlug: auth.server.editionSlug || null, profileKey: auth.server.profileKey },
      server: { ...snap, bans: snap.bans.map((b) => ({ name: b.name, at: b.at })), access: undefined },
    },
    slug: String(auth.server.slug),
    status: 200 as const,
  };
}

/**
 * Daily automatic restore point for every customer server whose configuration
 * changed since its last backup. Run from reconcile; cheap when nothing moved.
 */
export async function automaticBackups(now = new Date()): Promise<number> {
  await dbConnect();
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const servers = await CommunityServer.find({ ownerType: "user", updatedAt: { $gte: new Date(now.getTime() - 8 * 24 * 3600 * 1000) } });
  let made = 0;
  for (const server of servers) {
    const last = await ServerBackup.findOne({ serverId: server._id }).sort({ createdAt: -1 }).select({ hash: 1, createdAt: 1, kind: 1 }).lean();
    const lastAuto = await ServerBackup.findOne({ serverId: server._id, kind: "automatic" }).sort({ createdAt: -1 }).select({ createdAt: 1 }).lean();
    if (lastAuto && (lastAuto.createdAt as Date) > dayAgo) continue;
    if (last && last.hash === snapshotHash(snapshotOf(server))) continue;
    await writeBackup(server, "automatic", null, "Daily");
    made += 1;
  }
  return made;
}
