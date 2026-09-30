/**
 * A customer's saved PlayBound Dedicated servers.
 *
 * Saved servers are CommunityServer rows with `ownerType: "user"` — the same
 * object automatic Community Servers use, so discovery, one-click join, the
 * agent's managed rooms and player queries all work unchanged. A stopped
 * server costs no slots and keeps its configuration; starting one claims its
 * slots through the entitlement service first.
 */
import { randomBytes } from "crypto";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { listManagedHostRooms, requestManagedHostRoom, stopManagedHostRoom } from "@/lib/gameHost/client";
import { allocateSlots, releaseSlots, RUNNABLE_STATUSES } from "./entitlement";
import { authorizeServer, recordActivity } from "./access";
import { applyLiveState } from "./liveControl";
import { allowedSlotSizes, getTier, tierGame, type HostingTier } from "./tier";
import { getHostableGame } from "@/lib/gameHost/catalog";
import { isPendingDedicatedProfile } from "./pendingGames";

export type Fail = { error: string; status: 400 | 403 | 404 | 409 | 503 };
const fail = (error: string, status: Fail["status"] = 400): Fail => ({ error, status });

export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const SERVER_NAME_MAX = 60;
export const DESCRIPTION_MAX = 300;

export function cleanServerName(raw: unknown): string | null {
  const name = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > SERVER_NAME_MAX) return null;
  return name;
}

function cleanDescription(raw: unknown): string {
  return String(raw ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, DESCRIPTION_MAX);
}

/** The customer's current subscription for a tier (newest not yet expired). */
export async function currentSubscription(userId: string, tier = "basic") {
  await dbConnect();
  if (!Types.ObjectId.isValid(userId)) return null;
  return DedicatedSubscription.findOne({ userId, tier, status: { $ne: "expired" } }).sort({ createdAt: -1 });
}

export async function listCustomerServers(subscriptionId: string) {
  await dbConnect();
  return CommunityServer.find({ ownerType: "user", dedicatedSubscriptionId: subscriptionId }).sort({ createdAt: 1 }).lean();
}

/** Servers other owners have given this user a role on. */
export async function sharedServers(userId: string) {
  await dbConnect();
  if (!Types.ObjectId.isValid(userId)) return [];
  const rows = await CommunityServer.find({ ownerType: "user", "access.userId": userId }).sort({ name: 1 }).lean();
  return rows.map((r) => ({
    ...r,
    role: ((r.access as Array<{ userId: unknown; role: string }>) || []).find((a) => String(a.userId) === userId)?.role || "moderator",
  }));
}

/** Games this tier offers for new servers in a region, with their allowed sizes. */
export async function offeredGames(tier: HostingTier, regionKey: string) {
  const games = tier.games.filter(
    (g) => g.enabled && g.newServerCreationEnabled && !isPendingDedicatedProfile(g.profileKey) && (!g.supportedRegions.length || g.supportedRegions.includes(regionKey))
  );
  const profiles = await CommunityServerProfile.find({ key: { $in: games.map((g) => g.profileKey) } })
    .select({ key: 1, gameSlug: 1, editionSlug: 1, blockedReason: 1, verification: 1 })
    .lean();
  const byKey = new Map(profiles.map((p) => [p.key, p]));
  return games.map((g) => {
    const [gameSlug, edition] = g.profileKey.split(":");
    const profile = byKey.get(g.profileKey);
    const slug = profile?.gameSlug || gameSlug;
    return {
      profileKey: g.profileKey,
      gameSlug: slug,
      gameTitle: getHostableGame(slug)?.title || slug,
      editionSlug: profile?.editionSlug ?? (edition === "base" ? null : edition),
      sizes: allowedSlotSizes(tier, g),
      blocked: profile?.verification === "blocked",
    };
  }).filter((g) => g.sizes.length && !g.blocked);
}

export async function createServer(
  userId: string,
  input: { profileKey: string; name: unknown; description?: unknown; visibility?: unknown; slots: number; settings?: Record<string, unknown> }
) {
  const sub = await currentSubscription(userId);
  if (!sub) return fail("You need a PlayBound Dedicated subscription to create servers.", 403);
  const tier = await getTier(sub.tier);
  const game = tierGame(tier, String(input.profileKey || ""));
  if (isPendingDedicatedProfile(String(input.profileKey || ""))) return fail("This game is planned for Dedicated Basic but is not ready to host yet.");
  if (!game || !game.enabled || !game.newServerCreationEnabled) return fail("That game isn't available for new servers.");
  if (game.supportedRegions.length && !game.supportedRegions.includes(sub.regionKey)) {
    return fail("That game isn't available in your hosting region.");
  }
  const slots = Number(input.slots);
  if (!allowedSlotSizes(tier, game).includes(slots)) return fail("That server size isn't available for this game.");
  if (slots > sub.slotCapacity) return fail(`Your plan has ${sub.slotCapacity} slots; this server needs ${slots}.`);
  const name = cleanServerName(input.name);
  if (!name) return fail(`Server name must be 2–${SERVER_NAME_MAX} characters.`);
  const visibility = VISIBILITIES.includes(input.visibility as Visibility) ? (input.visibility as Visibility) : "public";
  const saved = await CommunityServer.countDocuments({ ownerType: "user", dedicatedSubscriptionId: sub._id });
  if (saved >= tier.maxSavedServers) {
    return fail(`You can save up to ${tier.maxSavedServers} servers. Delete one you no longer need first.`, 409);
  }
  const profile = await CommunityServerProfile.findOne({ key: game.profileKey }).lean();
  const [gameSlug, edition] = game.profileKey.split(":");
  const server = await CommunityServer.create({
    // Permanent identity: never derived from the editable name.
    slug: `${gameSlug}-${randomBytes(4).toString("hex")}`,
    name,
    description: cleanDescription(input.description),
    visibility,
    gameSlug: profile?.gameSlug || gameSlug,
    editionSlug: profile?.editionSlug ?? (edition === "base" ? null : edition),
    mod: profile?.mod || null,
    regionKey: sub.regionKey,
    profileKey: game.profileKey,
    settings: input.settings && typeof input.settings === "object" ? input.settings : {},
    desiredState: "stopped",
    runtimeState: "stopped",
    ownerType: "user",
    ownerId: userId,
    dedicatedSubscriptionId: sub._id,
    allocatedSlots: slots,
    slotsHeld: false,
  });
  return { server: server.toObject(), status: 201 as const };
}

export async function updateServer(
  userId: string,
  serverId: string,
  input: { name?: unknown; description?: unknown; visibility?: unknown; slots?: unknown }
) {
  const auth = await authorizeServer(userId, serverId, "server:configure");
  if ("error" in auth) return auth;
  const server = auth.server;
  const changes: string[] = [];
  let restartNeeded = false;
  if (input.name !== undefined) {
    const name = cleanServerName(input.name);
    if (!name) return fail(`Server name must be 2–${SERVER_NAME_MAX} characters.`);
    if (name !== server.name) {
      changes.push(`renamed "${server.name}" → "${name}"`);
      server.name = name;
      // The in-game name is set when the server starts.
      restartNeeded = server.desiredState === "running";
    }
  }
  if (input.description !== undefined) server.description = cleanDescription(input.description);
  if (input.visibility !== undefined) {
    if (!VISIBILITIES.includes(input.visibility as Visibility)) return fail("Unknown visibility");
    if (server.visibility !== input.visibility) changes.push(`visibility ${server.visibility} → ${input.visibility}`);
    server.visibility = input.visibility;
  }
  if (input.slots !== undefined) {
    const slots = Number(input.slots);
    if (slots !== server.allocatedSlots) {
      if (server.slotsHeld || server.desiredState === "running") return fail("Stop the server before changing its size.", 409);
      const sub = await DedicatedSubscription.findById(server.dedicatedSubscriptionId).lean();
      const tier = await getTier(sub?.tier || "basic");
      const game = tierGame(tier, server.profileKey);
      if (!game || !allowedSlotSizes(tier, game).includes(slots)) return fail("That server size isn't available for this game.");
      changes.push(`size ${server.allocatedSlots} → ${slots} slots`);
      server.allocatedSlots = slots;
    }
  }
  await server.save();
  if (changes.length) await recordActivity(server._id, { id: userId }, "server_updated", changes.join("; "));
  return { server: server.toObject(), restartNeeded, status: 200 as const };
}

/** Claim the server's slots, then ask the agent for its room. Releases the slots if the start is refused. */
export async function startServer(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:start");
  if ("error" in auth) return auth;
  const server = auth.server;
  const sub = await DedicatedSubscription.findById(server.dedicatedSubscriptionId).lean();
  if (!sub) return fail("Subscription not found", 404);
  if (!(RUNNABLE_STATUSES as readonly string[]).includes(String(sub.status))) return fail("Your hosting subscription is not active.", 403);
  const tier = await getTier(sub.tier);
  if (tier.startsDisabled) return fail("Server starts are temporarily paused. Please try again later.", 503);
  const game = tierGame(tier, server.profileKey);
  if (isPendingDedicatedProfile(server.profileKey)) return fail("This game is planned for Dedicated Basic but is not ready to host yet.", 503);
  if (!game || !game.enabled || !game.existingServerStartEnabled) return fail("This game is temporarily unavailable for hosting.", 503);

  const held = await allocateSlots(String(sub._id), String(server._id), server.allocatedSlots);
  if (!held.ok && held.code !== "ALREADY_HELD") return fail(held.error, held.code === "INSUFFICIENT_SLOTS" ? 409 : 403);

  const result = await launchRoom(server);
  if (result.status === "failed") {
    await releaseSlots(String(server._id));
    await CommunityServer.updateOne({ _id: server._id }, { $set: { desiredState: "stopped", runtimeState: "failed", decisionReason: result.error || "Start failed" } });
    return fail(result.error || "The server couldn't be started.", 503);
  }
  await CommunityServer.updateOne(
    { _id: server._id },
    { $set: { desiredState: "running", runtimeState: result.status === "running" ? "running" : "pending", decisionReason: "OWNER_START", recoveryAttempts: 0 } }
  );
  await recordActivity(server._id, { id: userId }, "server_started", `${server.allocatedSlots} slots`);
  await applyLiveStateNow(server);
  return { ok: true as const, status: 200 as const };
}

/** Best effort: bans and rotation onto the room that just started. Reconcile retries if this misses. */
async function applyLiveStateNow(server: { _id: unknown; gameSlug: string; bans?: Array<{ address: string }>; mapRotation?: string[] }) {
  try {
    const listed = await listManagedHostRooms();
    if (!listed.ok) return;
    const r = listed.rooms.find((x) => x.communityServerId === String(server._id));
    if (r && (await applyLiveState(server, r.roomId))) {
      await CommunityServer.updateOne({ _id: server._id }, { $set: { liveStateRoomId: r.roomId } });
    }
  } catch {
    /* reconcile applies it on its next pass */
  }
}

/** Ask the agent for this server's room, with its slot count as the enforced player cap. */
export async function launchRoom(server: {
  _id: unknown; gameSlug: string; editionSlug?: string | null; mod?: string | null; name: string;
  profileKey: string; allocatedSlots: number; settings?: Record<string, unknown> | null;
}) {
  if (isPendingDedicatedProfile(server.profileKey)) {
    return { status: "failed" as const, error: "This game is planned for Dedicated Basic but is not ready to host yet." };
  }
  const profile = await CommunityServerProfile.findOne({ key: server.profileKey }).select({ recipeSlug: 1 }).lean();
  const settings: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(server.settings || {})) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") settings[k] = v;
  }
  settings.maxPlayers = server.allocatedSlots;
  return requestManagedHostRoom({
    communityServerId: String(server._id),
    gameSlug: profile?.recipeSlug || server.gameSlug,
    editionSlug: server.editionSlug || null,
    mod: server.mod || null,
    name: server.name,
    settings,
    customerOwned: true,
  });
}

/** Stop the room; slots come back only once the agent confirms it has stopped. */
export async function stopServer(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:stop");
  if ("error" in auth) return auth;
  const server = auth.server;
  await recordActivity(server._id, { id: userId }, "server_stopped");
  await CommunityServer.updateOne({ _id: server._id }, { $set: { desiredState: "stopped", decisionReason: "OWNER_STOP" } });
  const stopped = await stopManagedHostRoom(String(server._id));
  if (!stopped.ok) {
    // Reconcile releases the slots once the room is confirmed gone.
    return fail(`Stop requested; the host didn't confirm yet (${stopped.error}).`, 503);
  }
  await CommunityServer.updateOne(
    { _id: server._id },
    { $set: { runtimeState: "stopped", health: "unknown", playerCount: null, host: null, port: null, onlineSince: null } }
  );
  await releaseSlots(String(server._id));
  return { ok: true as const, status: 200 as const };
}

/**
 * Restart in place. The slots stay held throughout — stopping and starting
 * through the entitlement would open a gap in which another server could take
 * them. If the relaunch fails the server stays wanted-online and reconcile
 * brings it back.
 */
export async function restartServer(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:restart");
  if ("error" in auth) return auth;
  const server = auth.server;
  if (isPendingDedicatedProfile(server.profileKey)) return fail("This game is planned for Dedicated Basic but is not ready to host yet.", 503);
  if (server.desiredState !== "running" || !server.slotsHeld) return startServer(userId, serverId);
  await recordActivity(server._id, { id: userId }, "server_restarted");
  const stopped = await stopManagedHostRoom(String(server._id));
  if (!stopped.ok) return fail(`The host didn't confirm the stop (${stopped.error}).`, 503);
  const result = await launchRoom(server);
  await CommunityServer.updateOne(
    { _id: server._id },
    { $set: { runtimeState: result.status === "failed" ? "failed" : result.status === "running" ? "running" : "pending", host: null, port: null, playerCount: null, decisionReason: result.status === "failed" ? `RESTART_FAILED: ${result.error || ""}` : "OWNER_RESTART" } }
  );
  if (result.status === "failed") return fail(result.error || "The server didn't come back up; PlayBound will keep trying.", 503);
  await applyLiveStateNow(server);
  return { ok: true as const, status: 200 as const };
}

export async function deleteServer(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:delete");
  if ("error" in auth) return auth;
  const server = auth.server;
  if (server.desiredState === "running" || server.slotsHeld) return fail("Stop the server before deleting it.", 409);
  await CommunityServer.deleteOne({ _id: server._id, slotsHeld: { $ne: true } });
  return { ok: true as const, status: 200 as const };
}
