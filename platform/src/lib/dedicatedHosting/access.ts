/**
 * Who may do what to a customer server.
 *
 * Every hosting API action asks `authorizeServer` for the specific permission
 * it needs — the UI hiding a button is a convenience, never the check. Roles
 * are bundles of permissions so a future custom role is a data change.
 */
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import ServerActivity from "@/lib/models/ServerActivity";
import User from "@/lib/models/User";

export const PERMISSIONS = [
  "server:view",
  "server:configure",
  "server:start",
  "server:stop",
  "server:restart",
  "server:change_map",
  "server:kick_players",
  "server:ban_players",
  "server:console",
  "server:manage_mods",
  "server:create_backup",
  "server:restore_backup",
  "server:manage_access",
  "server:manage_subscription",
  "server:delete",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type ServerRole = "owner" | "administrator" | "moderator";

export const ROLE_PERMISSIONS: Record<ServerRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  // Runs the server day to day; cannot change who has access, billing, or delete it.
  administrator: PERMISSIONS.filter(
    (p) => p !== "server:manage_access" && p !== "server:manage_subscription" && p !== "server:delete"
  ),
  // Keeps games civil: players and maps, nothing that costs slots or data.
  moderator: ["server:view", "server:change_map", "server:kick_players", "server:ban_players"],
};

export const ROLE_LABELS: Record<ServerRole, string> = {
  owner: "Owner",
  administrator: "Administrator",
  moderator: "Moderator",
};

export type Fail = { error: string; status: 400 | 403 | 404 | 409 | 503 };

type ServerDoc = NonNullable<Awaited<ReturnType<typeof CommunityServer.findOne>>>;

/** The user's role on a server, or null if they have none. */
export function roleOn(server: { ownerId?: unknown; access?: Array<{ userId: unknown; role: string }> }, userId: string): ServerRole | null {
  if (server.ownerId && String(server.ownerId) === userId) return "owner";
  const grant = (server.access || []).find((a) => String(a.userId) === userId);
  return grant ? (grant.role as ServerRole) : null;
}

export function can(role: ServerRole | null, permission: Permission): boolean {
  return Boolean(role && ROLE_PERMISSIONS[role].includes(permission));
}

/**
 * Load a customer server if `userId` holds `permission` on it.
 * Someone with no role gets 404, not 403: a private server's existence is not
 * confirmed to people who cannot see it.
 */
export async function authorizeServer(
  userId: string,
  serverId: string,
  permission: Permission
): Promise<{ server: ServerDoc; role: ServerRole } | Fail> {
  await dbConnect();
  if (!Types.ObjectId.isValid(serverId) || !Types.ObjectId.isValid(userId)) return { error: "Server not found", status: 404 };
  const server = await CommunityServer.findOne({ _id: serverId, ownerType: "user" });
  if (!server) return { error: "Server not found", status: 404 };
  const role = roleOn(server, userId);
  if (!role) return { error: "Server not found", status: 404 };
  if (!can(role, permission)) return { error: "You don't have permission to do that on this server.", status: 403 };
  return { server, role };
}

/** Append to a server's activity log. Never throws: an audit write must not undo the action it records. */
export async function recordActivity(
  serverId: unknown,
  actor: { id?: string | null; kind?: "user" | "admin" | "system" },
  action: string,
  detail?: string | null
): Promise<void> {
  try {
    let actorName: string | null = null;
    if (actor.id && Types.ObjectId.isValid(actor.id)) {
      const u = await User.findById(actor.id).select({ username: 1 }).lean();
      actorName = u?.username || null;
    }
    await ServerActivity.create({
      serverId,
      actorId: actor.id && Types.ObjectId.isValid(actor.id) ? actor.id : null,
      actorName: actor.kind === "system" ? "PlayBound" : actorName,
      actorKind: actor.kind || "user",
      action,
      detail: detail ? String(detail).slice(0, 500) : null,
    });
  } catch (err) {
    console.warn("[dedicated-hosting] activity log write failed:", err instanceof Error ? err.message : err);
  }
}

export async function listActivity(serverId: string, limit = 100) {
  await dbConnect();
  return ServerActivity.find({ serverId }).sort({ createdAt: -1 }).limit(limit).lean();
}

/** The owner grants a role to another PlayBound user by username. */
export async function grantAccess(serverId: string, actorId: string, username: string, role: unknown) {
  if (role !== "administrator" && role !== "moderator") return { error: "Unknown role", status: 400 as const };
  const auth = await authorizeServer(actorId, serverId, "server:manage_access");
  if ("error" in auth) return auth;
  const user = await User.findOne({ usernameNormalized: String(username || "").trim().toLowerCase() }).select({ _id: 1, username: 1 }).lean();
  if (!user) return { error: "No PlayBound user with that username.", status: 404 as const };
  if (String(user._id) === String(auth.server.ownerId)) return { error: "That's the owner.", status: 400 as const };
  const others = (auth.server.access || []).filter((a: { userId: unknown }) => String(a.userId) !== String(user._id));
  if (others.length >= 20) return { error: "A server can have at most 20 people with roles.", status: 409 as const };
  auth.server.access = [...others, { userId: user._id, role, grantedBy: actorId, grantedAt: new Date() }];
  await auth.server.save();
  await recordActivity(serverId, { id: actorId }, "access_granted", `${user.username} → ${ROLE_LABELS[role]}`);
  return { ok: true as const };
}

export async function revokeAccess(serverId: string, actorId: string, userId: string) {
  // Anyone may remove themselves; removing others needs manage_access.
  const self = actorId === userId;
  const auth = await authorizeServer(actorId, serverId, self ? "server:view" : "server:manage_access");
  if ("error" in auth) return auth;
  const before = (auth.server.access || []).length;
  auth.server.access = (auth.server.access || []).filter((a: { userId: unknown }) => String(a.userId) !== userId);
  if (auth.server.access.length === before) return { error: "That person has no role here.", status: 404 as const };
  await auth.server.save();
  const u = await User.findById(userId).select({ username: 1 }).lean();
  await recordActivity(serverId, { id: actorId }, self ? "access_left" : "access_revoked", u?.username || userId);
  return { ok: true as const };
}

/** Everyone with a role, owner first, for the Access tab. */
export async function listAccess(server: { ownerId?: unknown; access?: Array<{ userId: unknown; role: string; grantedAt?: Date }> }) {
  const ids = [server.ownerId, ...(server.access || []).map((a) => a.userId)].filter(Boolean);
  const users = await User.find({ _id: { $in: ids } }).select({ username: 1 }).lean();
  const name = new Map(users.map((u) => [String(u._id), u.username]));
  return [
    { userId: String(server.ownerId), username: name.get(String(server.ownerId)) || null, role: "owner" as ServerRole },
    ...(server.access || []).map((a) => ({
      userId: String(a.userId),
      username: name.get(String(a.userId)) || null,
      role: a.role as ServerRole,
    })),
  ];
}
