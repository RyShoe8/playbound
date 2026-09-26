/**
 * Maps and bans on customer servers, over the game's live console channel.
 *
 * Both are kept by PlayBound as well as sent to the game: a game server forgets
 * its ban list and rotation when it restarts, so `applyLiveState` re-sends them
 * to every new room. Player addresses are read from the game's own `status`
 * reply at ban time, stored server-side, and never returned to a browser.
 */
import { Types } from "mongoose";
import CommunityServer from "@/lib/models/CommunityServer";
import { listManagedHostRooms, sendRoomCommand } from "@/lib/gameHost/client";
import {
  banCommands,
  changeMapCommand,
  kickCommand,
  nextMapCommand,
  parseCurrentMap,
  parseStatus,
  rotationCommands,
  unbanCommands,
} from "@/lib/serverControl/rcon";
import { getServerSettingProfile } from "@/lib/serverControl/settings";
import { authorizeServer, recordActivity, type Fail } from "./access";

const MAX_BANS = 500;
const MAX_ROTATION = 30;

async function roomIdFor(serverId: string): Promise<string | null> {
  const listed = await listManagedHostRooms();
  if (!listed.ok) return null;
  return listed.rooms.find((r) => r.communityServerId === serverId)?.roomId || null;
}

async function send(roomId: string, command: string): Promise<string> {
  const sent = await sendRoomCommand(roomId, command);
  if (!sent.ok) throw new Error(sent.error);
  return sent.response;
}

function channelOf(gameSlug: string) {
  return getServerSettingProfile(gameSlug)?.controlChannel;
}

/** Map list, current map, next-map and rotation support for the Maps tab. */
export async function getMaps(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:view");
  if ("error" in auth) return auth;
  const profile = getServerSettingProfile(auth.server.gameSlug);
  const spec = profile?.controlChannel ? profile.maps : undefined;
  if (!spec) return { error: "This game's maps can't be changed from PlayBound.", status: 400 } satisfies Fail;
  let current: string | null = null;
  const roomId = await roomIdFor(serverId);
  if (roomId) current = parseCurrentMap(profile!.controlChannel, await send(roomId, "status").catch(() => ""));
  return {
    options: spec.options,
    current,
    running: Boolean(roomId),
    canNext: Boolean(spec.nextCommand),
    canRotate: Boolean(spec.rotation),
    rotation: (auth.server.mapRotation || []) as string[],
    status: 200 as const,
  };
}

async function liveMapAction(
  userId: string,
  serverId: string,
  map: string,
  build: (spec: NonNullable<ReturnType<typeof getServerSettingProfile>>["maps"] & object, map: string) => string | null,
  action: string
) {
  const auth = await authorizeServer(userId, serverId, "server:change_map");
  if ("error" in auth) return auth;
  const spec = getServerSettingProfile(auth.server.gameSlug)?.maps;
  if (!spec) return { error: "This game's maps can't be changed from PlayBound.", status: 400 } satisfies Fail;
  let command: string | null;
  try {
    command = build(spec, map);
  } catch {
    return { error: "That map isn't on this server.", status: 400 } satisfies Fail;
  }
  if (!command) return { error: "This game can't queue a next map.", status: 400 } satisfies Fail;
  const roomId = await roomIdFor(serverId);
  if (!roomId) return { error: "Start the server first.", status: 409 } satisfies Fail;
  try {
    await send(roomId, command);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The server didn't answer.", status: 503 } satisfies Fail;
  }
  const label = spec.options.find((o) => o.value === map)?.label || map;
  await recordActivity(serverId, { id: userId }, action, label);
  return { ok: true as const, status: 200 as const };
}

export const changeMap = (userId: string, serverId: string, map: string) =>
  liveMapAction(userId, serverId, map, changeMapCommand, "map_changed");

export const setNextMap = (userId: string, serverId: string, map: string) =>
  liveMapAction(userId, serverId, map, nextMapCommand, "next_map_set");

/** Save a rotation and, if the server is running, install it from the next map change. */
export async function setRotation(userId: string, serverId: string, maps: unknown) {
  const auth = await authorizeServer(userId, serverId, "server:change_map");
  if ("error" in auth) return auth;
  const spec = getServerSettingProfile(auth.server.gameSlug)?.maps;
  if (!spec?.rotation) return { error: "This game doesn't support a map rotation from PlayBound.", status: 400 } satisfies Fail;
  const list = Array.isArray(maps) ? maps.map(String) : [];
  if (list.length > MAX_ROTATION) return { error: `A rotation can have up to ${MAX_ROTATION} maps.`, status: 400 } satisfies Fail;
  if (list.some((m) => !spec.options.some((o) => o.value === m))) return { error: "That map isn't on this server.", status: 400 } satisfies Fail;
  auth.server.mapRotation = list;
  await auth.server.save();
  const roomId = await roomIdFor(serverId);
  if (roomId && list.length) {
    try {
      for (const cmd of rotationCommands(spec, list)) await send(roomId, cmd);
    } catch (err) {
      return { error: `Saved, but the running server didn't take it: ${err instanceof Error ? err.message : "no answer"}`, status: 503 } satisfies Fail;
    }
  }
  const labels = list.map((m) => spec.options.find((o) => o.value === m)?.label || m);
  await recordActivity(serverId, { id: userId }, "rotation_set", labels.length ? labels.join(" → ") : "cleared");
  return { ok: true as const, applied: Boolean(roomId), status: 200 as const };
}

/** Ban a connected player by their client id: read their address from `status`, ban it, kick them. */
export async function banPlayer(userId: string, serverId: string, playerId: string) {
  const auth = await authorizeServer(userId, serverId, "server:ban_players");
  if ("error" in auth) return auth;
  const channel = channelOf(auth.server.gameSlug);
  if (!channel) return { error: "This game doesn't support bans from PlayBound.", status: 400 } satisfies Fail;
  const roomId = await roomIdFor(serverId);
  if (!roomId) return { error: "The server isn't running.", status: 409 } satisfies Fail;
  try {
    const player = parseStatus(channel, await send(roomId, "status")).find((p) => p.id === String(playerId));
    if (!player) return { error: "That player has left.", status: 404 } satisfies Fail;
    if (player.bot || !player.address) return { error: "Bots can't be banned; kick them instead.", status: 400 } satisfies Fail;
    if ((auth.server.bans || []).length >= MAX_BANS) return { error: `A server can keep up to ${MAX_BANS} bans.`, status: 409 } satisfies Fail;
    if (!(auth.server.bans || []).some((b: { address: string }) => b.address === player.address)) {
      auth.server.bans.push({ name: player.name, address: player.address, bannedBy: new Types.ObjectId(userId), at: new Date() });
      await auth.server.save();
    }
    for (const cmd of banCommands(channel, player.address)) await send(roomId, cmd);
    await send(roomId, kickCommand(channel, player.id));
    await recordActivity(serverId, { id: userId }, "player_banned", player.name);
    return { ok: true as const, status: 200 as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ban failed.", status: 503 } satisfies Fail;
  }
}

/** Bans for the UI: names and when, never addresses. */
export async function listBans(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:view");
  if ("error" in auth) return auth;
  return {
    bans: (auth.server.bans || []).map((b: { _id: unknown; name: string; at: Date }) => ({ id: String(b._id), name: b.name, at: b.at })),
    status: 200 as const,
  };
}

export async function unbanPlayer(userId: string, serverId: string, banId: string) {
  const auth = await authorizeServer(userId, serverId, "server:ban_players");
  if ("error" in auth) return auth;
  const ban = (auth.server.bans || []).find((b: { _id: unknown }) => String(b._id) === banId);
  if (!ban) return { error: "No such ban.", status: 404 } satisfies Fail;
  auth.server.bans = auth.server.bans.filter((b: { _id: unknown }) => String(b._id) !== banId);
  await auth.server.save();
  let liftedNow = false;
  const channel = channelOf(auth.server.gameSlug);
  const roomId = await roomIdFor(serverId);
  const cmds = channel ? unbanCommands(channel, ban.address) : null;
  if (roomId && cmds) {
    try {
      for (const c of cmds) await send(roomId, c);
      liftedNow = true;
    } catch {
      /* lifted at next restart regardless */
    }
  }
  await recordActivity(serverId, { id: userId }, "player_unbanned", ban.name);
  return { ok: true as const, liftedNow: liftedNow || !roomId, status: 200 as const };
}

/**
 * Re-send bans and the rotation to a room that has not had them yet. Called by
 * reconcile when a customer server's room changes (start, restart, recovery).
 * Returns true once applied, so the caller records the room.
 */
export async function applyLiveState(server: {
  gameSlug: string;
  bans?: Array<{ address: string }>;
  mapRotation?: string[];
}, roomId: string): Promise<boolean> {
  const profile = getServerSettingProfile(server.gameSlug);
  const channel = profile?.controlChannel;
  if (!channel) return true;
  const commands: string[] = [];
  for (const b of server.bans || []) commands.push(...banCommands(channel, b.address));
  if (profile.maps?.rotation && server.mapRotation?.length) commands.push(...rotationCommands(profile.maps, server.mapRotation));
  for (const c of commands) {
    const sent = await sendRoomCommand(roomId, c);
    if (!sent.ok) return false;
  }
  return true;
}
