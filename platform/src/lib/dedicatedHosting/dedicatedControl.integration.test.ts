/**
 * Server Control for customer servers: roles and permissions enforced on every
 * action, the slot count locked, live settings over rcon, the console guard,
 * and the activity log. Real (in-memory) MongoDB; the game-host agent is faked
 * and records the rcon commands it would have sent.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const rooms = new Map<string, { roomId: string; host: string; port: number; communityServerId: string }>();
const sent: string[] = [];
let spawns = 0;
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock("@/lib/gameHost/client", () => ({
  requestManagedHostRoom: vi.fn(async (opts: { communityServerId: string }) => {
    // Every spawn gets a new room id, as the real agent does.
    rooms.set(opts.communityServerId, { roomId: `room-${opts.communityServerId}-${++spawns}`, host: "1.2.3.4", port: 27960, communityServerId: opts.communityServerId });
    return { status: "running" };
  }),
  stopManagedHostRoom: vi.fn(async (id: string) => {
    rooms.delete(id);
    return { ok: true };
  }),
  listManagedHostRooms: vi.fn(async () => ({ ok: true, rooms: [...rooms.values()], jobs: {} })),
  sendRoomCommand: vi.fn(async (_roomId: string, command: string) => {
    sent.push(command);
    if (command === "status") {
      return { ok: true, response: "map: oa_dm1\nnum score ping name            lastmsg address               qport rate\n--- ----- ---- --------------- ------- --------------------- ----- -----\n  0    12   48 Ryan^7                0 203.0.113.9:27960      12345 25000\n" };
    }
    return { ok: true, response: "" };
  }),
}));
vi.mock("@/lib/communityHosting/playerQuery", () => ({ managedQueryKind: () => null, queryManagedOccupancy: async () => null }));

import User from "@/lib/models/User";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import CommunityServer from "@/lib/models/CommunityServer";
import ServerActivity from "@/lib/models/ServerActivity";
import { createServer, startServer, stopServer, deleteServer, updateServer } from "./servers";
import { applyControlSettings, getControl, kickPlayer, listPlayers, runConsole } from "./control";
import { grantAccess, revokeAccess } from "./access";
import { authorizeServer } from "./access";
import { sharedServers } from "./servers";
import { addHostingAdmin, redeemHostingAdminInvites, removeHostingAdmin } from "./admins";
import { getTier, saveTier } from "./tier";

let mongo: MongoMemoryServer;
const ids = { owner: "", admin: "", mod: "", stranger: "" };
let serverId = "";

async function user(name: string) {
  const u = await User.create({ username: name, usernameNormalized: name.toLowerCase(), email: `${name}@example.com`, password: "x".repeat(20) });
  return String(u._id);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "dedicated-control-test" });
  const tier = await getTier();
  await saveTier("basic", {
    games: [...tier.games, { ...tier.games[0], profileKey: "openarena:base", maxSlots: 16 }].map((g) => ({ ...g, enabled: true })),
  });
  ids.owner = await user("Owner");
  ids.admin = await user("Admin");
  ids.mod = await user("Mod");
  ids.stranger = await user("Stranger");
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  rooms.clear();
  sent.length = 0;
  await CommunityServer.deleteMany({});
  await DedicatedSubscription.deleteMany({});
  await ServerActivity.deleteMany({});
  await DedicatedSubscription.create({ userId: ids.owner, tier: "basic", regionKey: "us-central", slotCapacity: 16 });
  const created = await createServer(ids.owner, { profileKey: "openarena:base", slots: 8, name: "Frag Night" });
  if ("error" in created) throw new Error(created.error);
  serverId = String(created.server._id);
  expect(await grantAccess(serverId, ids.owner, "Admin", "administrator")).toMatchObject({ ok: true });
  expect(await grantAccess(serverId, ids.owner, "Mod", "moderator")).toMatchObject({ ok: true });
});

describe("customer Server Control", () => {
  it("gives a subscription administrator access to existing and future servers, then revokes it", async () => {
    await grantAccess(serverId, ids.owner, "Stranger", "moderator");
    await DedicatedSubscription.updateOne({ userId: ids.owner }, {
      $push: { admins: { userId: ids.stranger, grantedBy: ids.owner, grantedAt: new Date() } },
    });
    expect(await authorizeServer(ids.stranger, serverId, "server:configure")).toMatchObject({ role: "administrator" });
    expect(await authorizeServer(ids.stranger, serverId, "server:manage_subscription")).toMatchObject({ status: 403 });
    const another = await createServer(ids.owner, { profileKey: "openarena:base", slots: 8, name: "Another Room" });
    if ("error" in another) throw new Error(another.error);
    const secondId = String(another.server._id);
    expect(await authorizeServer(ids.stranger, secondId, "server:start")).toMatchObject({ role: "administrator" });
    expect((await sharedServers(ids.stranger)).map((s) => String(s._id))).toContain(secondId);
    await DedicatedSubscription.updateOne({ userId: ids.owner }, { $pull: { admins: { userId: ids.stranger } } });
    expect(await authorizeServer(ids.stranger, serverId, "server:configure")).toMatchObject({ status: 403 });
    expect(await authorizeServer(ids.stranger, secondId, "server:view")).toMatchObject({ status: 404 });
  });
  it("lets the owner add a verified PlayBound name as an account administrator", async () => {
    await User.updateOne({ _id: ids.stranger }, { $set: { emailVerified: true } });
    expect(await addHostingAdmin(ids.owner, { username: "Stranger" })).toMatchObject({ ok: true });
    expect(await authorizeServer(ids.stranger, serverId, "server:configure")).toMatchObject({ role: "administrator" });
    expect(await removeHostingAdmin(ids.owner, { userId: ids.stranger })).toMatchObject({ ok: true });
    expect(await authorizeServer(ids.stranger, serverId, "server:view")).toMatchObject({ status: 404 });
  });
  it("grants an email invitation only after that address is verified", async () => {
    await User.updateOne({ _id: ids.stranger }, { $set: { emailVerified: false } });
    expect(await addHostingAdmin(ids.owner, { email: "stranger@example.com" })).toMatchObject({ invited: true });
    expect(await authorizeServer(ids.stranger, serverId, "server:view")).toMatchObject({ status: 404 });
    expect(await redeemHostingAdminInvites("stranger@example.com", ids.stranger)).toBe(0);
    await User.updateOne({ _id: ids.stranger }, { $set: { emailVerified: true } });
    expect(await redeemHostingAdminInvites("stranger@example.com", ids.stranger)).toBe(1);
    expect(await authorizeServer(ids.stranger, serverId, "server:configure")).toMatchObject({ role: "administrator" });
  });
  it("hides the server from people with no role", async () => {
    expect(await getControl(ids.stranger, serverId)).toMatchObject({ status: 404 });
    expect(await startServer(ids.stranger, serverId)).toMatchObject({ status: 404 });
    expect(await getControl(new Types.ObjectId().toString(), serverId)).toMatchObject({ status: 404 });
  });

  it("gives moderators players and maps only", async () => {
    await startServer(ids.owner, serverId);
    expect(await startServer(ids.mod, serverId)).toMatchObject({ status: 403 });
    expect(await stopServer(ids.mod, serverId)).toMatchObject({ status: 403 });
    expect(await updateServer(ids.mod, serverId, { name: "Mine now" })).toMatchObject({ status: 403 });
    expect(await runConsole(ids.mod, serverId, "status")).toMatchObject({ status: 403 });
    expect(await applyControlSettings(ids.mod, serverId, { fraglimit: 50 })).toMatchObject({ status: 403 });
    expect(await kickPlayer(ids.mod, serverId, "0", "Ryan")).toMatchObject({ ok: true });
    expect(sent).toContain("clientkick 0");
    expect(await grantAccess(serverId, ids.mod, "Stranger", "moderator")).toMatchObject({ status: 403 });
  });

  it("lets administrators run the server but not manage access or delete it", async () => {
    expect(await startServer(ids.admin, serverId)).toMatchObject({ ok: true });
    expect(await runConsole(ids.admin, serverId, "status")).toMatchObject({ status: 200 });
    expect(await grantAccess(serverId, ids.admin, "Stranger", "moderator")).toMatchObject({ status: 403 });
    await stopServer(ids.admin, serverId);
    expect(await deleteServer(ids.admin, serverId)).toMatchObject({ status: 403 });
  });

  it("never offers or accepts the game's own slot setting", async () => {
    const control = await getControl(ids.owner, serverId);
    if ("error" in control) throw new Error(control.error);
    expect(control.definitions.map((d) => d.key)).not.toContain("sv_maxclients");
    expect(control.values).not.toHaveProperty("maxPlayers");
    expect(await applyControlSettings(ids.owner, serverId, { sv_maxclients: 64 })).toMatchObject({ status: 400 });
  });

  it("applies live settings over rcon without restarting, and logs them", async () => {
    await startServer(ids.owner, serverId);
    const result = await applyControlSettings(ids.owner, serverId, { fraglimit: 30 });
    expect(result).toMatchObject({ outcome: "applied-live", applied: { fraglimit: 30 } });
    expect(sent.some((c) => /fraglimit/.test(c))).toBe(true);
    expect(rooms.has(serverId)).toBe(true);
    const stored = await CommunityServer.findById(serverId).lean();
    expect(stored?.settings).toMatchObject({ fraglimit: 30 });
    expect(stored?.settings).not.toHaveProperty("maxPlayers");
    const log = await ServerActivity.find({ serverId }).lean();
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["server_started", "settings_changed"]));
  });

  it("saves changes to a stopped server for its next start", async () => {
    const result = await applyControlSettings(ids.owner, serverId, { timelimit: 15 });
    expect(result).toMatchObject({ outcome: "queued" });
    expect((await CommunityServer.findById(serverId).lean())?.settings).toMatchObject({ timelimit: 15 });
  });

  it("lists players and refuses guarded console commands", async () => {
    await startServer(ids.owner, serverId);
    const players = await listPlayers(ids.owner, serverId);
    expect(players).toMatchObject({ players: [{ name: "Ryan", id: "0" }] });
    expect(await runConsole(ids.owner, serverId, "set sv_maxclients 64")).toMatchObject({ status: 400 });
    expect(await runConsole(ids.owner, serverId, "status; quit")).toMatchObject({ status: 400 });
    expect(sent).not.toContain("set sv_maxclients 64");
  });

  it("lets someone leave a server they were given", async () => {
    expect(await revokeAccess(serverId, ids.mod, ids.mod)).toMatchObject({ ok: true });
    expect(await getControl(ids.mod, serverId)).toMatchObject({ status: 404 });
  });
});

describe("maps and bans on customer servers", () => {
  it("bans by the player's address, kicks them, and never shows the address", async () => {
    await startServer(ids.owner, serverId);
    sent.length = 0;
    const { banPlayer, listBans } = await import("./liveControl");
    expect(await banPlayer(ids.mod, serverId, "0")).toMatchObject({ ok: true });
    expect(sent).toEqual(expect.arrayContaining(["addip 203.0.113.9", "clientkick 0"]));
    const bans = await listBans(ids.owner, serverId);
    if ("error" in bans) throw new Error(bans.error);
    expect(bans.bans).toHaveLength(1);
    expect(JSON.stringify(bans.bans)).not.toContain("203.0.113.9");
    expect(await banPlayer(ids.stranger, serverId, "0")).toMatchObject({ status: 404 });
  });

  it("changes maps only to the game's own maps, and keeps a rotation across restarts", async () => {
    await startServer(ids.owner, serverId);
    const { changeMap, setRotation, getMaps, banPlayer } = await import("./liveControl");
    sent.length = 0;
    expect(await changeMap(ids.mod, serverId, "oa_dm3")).toMatchObject({ ok: true });
    expect(sent).toContain("map oa_dm3");
    expect(await changeMap(ids.owner, serverId, "oa_dm3; quit")).toMatchObject({ status: 400 });
    expect(await setRotation(ids.owner, serverId, ["oa_dm1", "oa_dm2"])).toMatchObject({ ok: true, applied: true });
    expect(sent).toContain('set nextmap "vstr pb_rot0"');
    const maps = await getMaps(ids.owner, serverId);
    expect(maps).toMatchObject({ rotation: ["oa_dm1", "oa_dm2"], current: "oa_dm1", canRotate: true });
    await banPlayer(ids.owner, serverId, "0");

    // A crash: a new room must get the bans and rotation again, once.
    const { reconcileDedicatedServers } = await import("./reconcile");
    rooms.delete(serverId);
    await reconcileDedicatedServers();
    sent.length = 0;
    await reconcileDedicatedServers();
    expect(sent).toEqual(expect.arrayContaining(["addip 203.0.113.9", 'set pb_rot0 "map oa_dm1; set nextmap vstr pb_rot1"']));
    const room = rooms.get(serverId)!;
    expect((await CommunityServer.findById(serverId).lean())?.liveStateRoomId).toBe(room.roomId);
    sent.length = 0;
    await reconcileDedicatedServers();
    expect(sent.filter((c) => c.startsWith("addip"))).toHaveLength(0);
  });

  it("lifts a ban on the running server", async () => {
    await startServer(ids.owner, serverId);
    const { banPlayer, listBans, unbanPlayer } = await import("./liveControl");
    await banPlayer(ids.owner, serverId, "0");
    const bans = await listBans(ids.owner, serverId);
    if ("error" in bans) throw new Error(bans.error);
    sent.length = 0;
    expect(await unbanPlayer(ids.owner, serverId, bans.bans[0].id)).toMatchObject({ ok: true, liftedNow: true });
    expect(sent).toContain("removeip 203.0.113.9");
  });
});

describe("restore points", () => {
  it("keeps the tier's number of restore points and restores a setup, saving the current one first", async () => {
    const { createBackup, listBackups, restoreBackup } = await import("./backups");
    const ServerBackup = (await import("@/lib/models/ServerBackup")).default;
    await applyControlSettings(ids.owner, serverId, { fraglimit: 11 });
    const first = await createBackup(ids.owner, serverId, "Eleven");
    if ("error" in first) throw new Error(first.error);
    for (let i = 0; i < 3; i++) await createBackup(ids.owner, serverId, `extra ${i}`);
    const listed = await listBackups(ids.owner, serverId);
    if ("error" in listed) throw new Error(listed.error);
    expect(listed.retention).toBe(3);
    expect(listed.backups).toHaveLength(3);
    expect(await ServerBackup.exists({ _id: first.id })).toBeNull(); // oldest pruned

    const keep = listed.backups[listed.backups.length - 1];
    await applyControlSettings(ids.owner, serverId, { fraglimit: 99 });
    await updateServer(ids.owner, serverId, { name: "Renamed" });
    expect(await restoreBackup(ids.owner, serverId, keep.id)).toMatchObject({ ok: true });
    const after = await CommunityServer.findById(serverId).lean();
    expect(after?.name).toBe("Frag Night");
    expect(after?.settings).toMatchObject({ fraglimit: 11 });
    const kinds = (await ServerBackup.find({ serverId }).lean()).map((b) => b.kind);
    expect(kinds).toContain("before-restore");
  });

  it("does not change a running server's size, and moderators cannot back up or restore", async () => {
    const { createBackup, restoreBackup } = await import("./backups");
    const made = await createBackup(ids.owner, serverId);
    if ("error" in made) throw new Error(made.error);
    await startServer(ids.owner, serverId);
    await CommunityServer.updateOne({ _id: serverId }, { $set: { allocatedSlots: 12 } });
    const r = await restoreBackup(ids.owner, serverId, made.id);
    expect(r).toMatchObject({ ok: true });
    expect("notes" in r && r.notes.join(" ")).toMatch(/stop the server/i);
    expect((await CommunityServer.findById(serverId).lean())?.allocatedSlots).toBe(12);
    expect(await createBackup(ids.mod, serverId)).toMatchObject({ status: 403 });
    expect(await restoreBackup(ids.mod, serverId, made.id)).toMatchObject({ status: 403 });
  });

  it("exports the setup without player addresses, and skips unchanged daily backups", async () => {
    const { exportServer, automaticBackups } = await import("./backups");
    await startServer(ids.owner, serverId);
    const { banPlayer } = await import("./liveControl");
    await banPlayer(ids.owner, serverId, "0");
    const exported = await exportServer(ids.owner, serverId);
    if ("error" in exported) throw new Error(exported.error);
    expect(JSON.stringify(exported.file)).not.toContain("203.0.113.9");
    expect(exported.file.server.bans).toHaveLength(1);
    expect(await automaticBackups()).toBeGreaterThanOrEqual(1);
    expect(await automaticBackups()).toBe(0);
  });
});
