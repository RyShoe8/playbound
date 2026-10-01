/**
 * PlayBound Dedicated 1.0 acceptance cases that do not need billing, against a
 * real (in-memory) MongoDB so the atomic slot accounting is exercised for real.
 * The game-host agent is faked: it records rooms and can be told to fail.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const rooms = new Map<string, { roomId: string; host: string; port: number; communityServerId: string }>();
let failNextStart = false;
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/gameHost/client", () => ({
  requestManagedHostRoom: vi.fn(async (opts: { communityServerId: string; settings?: { maxPlayers?: number } }) => {
    if (failNextStart) {
      failNextStart = false;
      return { status: "failed", error: "spawn failed" };
    }
    rooms.set(opts.communityServerId, { roomId: `room-${opts.communityServerId}`, host: "1.2.3.4", port: 27000, communityServerId: opts.communityServerId });
    return { status: "running" };
  }),
  stopManagedHostRoom: vi.fn(async (id: string) => {
    rooms.delete(id);
    return { ok: true };
  }),
  listManagedHostRooms: vi.fn(async () => ({ ok: true, rooms: [...rooms.values()], jobs: {} })),
}));
vi.mock("@/lib/communityHosting/playerQuery", () => ({
  managedQueryKind: () => null,
  queryManagedOccupancy: async () => null,
}));

import CommunityServer from "@/lib/models/CommunityServer";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { createServer, deleteServer, startServer, stopServer, updateServer } from "./servers";
import { reconcileAllocations } from "./entitlement";
import { reconcileDedicatedServers } from "./reconcile";
import { saveTier, getTier } from "./tier";

let mongo: MongoMemoryServer;
const userId = new Types.ObjectId().toString();
let subId: string;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "dedicated-hosting-test" });
  const tier = await getTier();
  // Make every default game creatable in the test region.
  await saveTier("basic", { games: tier.games.map((g) => ({ ...g, enabled: true })) });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  rooms.clear();
  await CommunityServer.deleteMany({});
  await DedicatedSubscription.deleteMany({});
  const sub = await DedicatedSubscription.create({ userId, tier: "basic", regionKey: "us-central", slotCapacity: 16 });
  subId = String(sub._id);
});

async function make(profileKey: string, slots: number, name = `${profileKey} ${slots}`) {
  const r = await createServer(userId, { profileKey, slots, name });
  if ("error" in r) throw new Error(r.error);
  return String(r.server._id);
}
const used = async () => Number((await DedicatedSubscription.findById(subId).lean())?.allocatedSlots);

describe("PlayBound Dedicated Basic slot pool", () => {
  it("runs four 4-slot servers and refuses a fifth", async () => {
    const ids = await Promise.all([1, 2, 3, 4, 5].map((n) => make("xonotic:base", 4, `X ${n}`)));
    for (const id of ids.slice(0, 4)) expect(await startServer(userId, id)).toMatchObject({ ok: true });
    const fifth = await startServer(userId, ids[4]);
    expect(fifth).toMatchObject({ status: 409 });
    expect(await used()).toBe(16);
  });

  it("reuses stopped slots for one 16-slot server, then 8 + 4 + 4", async () => {
    const small = await Promise.all([1, 2, 3, 4].map((n) => make("xonotic:base", 4, `S ${n}`)));
    for (const id of small) await startServer(userId, id);
    for (const id of small) await stopServer(userId, id);
    expect(await used()).toBe(0);
    const big = await make("openttd:base", 16);
    expect(await startServer(userId, big)).toMatchObject({ ok: true });
    await stopServer(userId, big);
    const eight = await make("openttd:base", 8);
    for (const id of [eight, small[0], small[1]]) expect(await startServer(userId, id)).toMatchObject({ ok: true });
    expect(await used()).toBe(16);
  });

  it("never exceeds the pool when starts race", async () => {
    const a = await make("openttd:base", 12);
    const b = await make("openttd:base", 8);
    const results = await Promise.all([startServer(userId, a), startServer(userId, b)]);
    expect(results.filter((r) => "ok" in r).length).toBe(1);
    expect(await used()).toBeLessThanOrEqual(16);
  });

  it("honors a scheduled downgrade's smaller cap before the next billing period", async () => {
    const eight = await make("openttd:base", 8);
    const extra = await make("xonotic:base", 4);
    expect(await startServer(userId, eight)).toMatchObject({ ok: true });
    await DedicatedSubscription.updateOne({ _id: subId }, { $set: { scheduledChange: {
      targetSlots: 8, stripePriceId: "price_future", monthlyPriceCents: 1299, currency: "usd",
      effectiveAt: new Date(Date.now() + 25 * 24 * 60 * 60_000), requestKey: "test-downgrade", state: "scheduled",
    } } });
    expect(await startServer(userId, extra)).toMatchObject({ status: 409 });
    expect(await used()).toBe(8);
  });

  it("switches games by stopping one and starting another; the first keeps its settings", async () => {
    const openttd = await make("openttd:base", 16, "OpenTTD World");
    await CommunityServer.updateOne({ _id: openttd }, { $set: { settings: { map: "big" } } });
    await startServer(userId, openttd);
    const xonotic = await make("xonotic:base", 16, "Friday Xonotic");
    expect(await startServer(userId, xonotic)).toMatchObject({ status: 409 });
    await stopServer(userId, openttd);
    expect(await startServer(userId, xonotic)).toMatchObject({ ok: true });
    const kept = await CommunityServer.findById(openttd).lean();
    expect(kept?.settings).toEqual({ map: "big" });
  });

  it("releases slots when the host refuses to start the server", async () => {
    const id = await make("xonotic:base", 8);
    failNextStart = true;
    expect(await startServer(userId, id)).toMatchObject({ status: 503 });
    expect(await used()).toBe(0);
  });

  it("renames without changing the permanent identity", async () => {
    const id = await make("xonotic:base", 4, "Old Name");
    const before = await CommunityServer.findById(id).lean();
    await updateServer(userId, id, { name: "New Name" });
    const after = await CommunityServer.findById(id).lean();
    expect(after?.name).toBe("New Name");
    expect(after?.slug).toBe(before?.slug);
  });

  it("limits saved servers to ten and refuses ineligible games and sizes", async () => {
    for (let i = 0; i < 10; i++) await make("xonotic:base", 4, `Saved ${i}`);
    expect(await createServer(userId, { profileKey: "xonotic:base", slots: 4, name: "Eleventh" })).toMatchObject({ status: 409 });
    await CommunityServer.deleteMany({});
    expect(await createServer(userId, { profileKey: "counter-strike-2:base", slots: 4, name: "CS2" })).toMatchObject({ status: 400 });
    expect(await createServer(userId, { profileKey: "bombsquad:base", slots: 17, name: "Too big" })).toMatchObject({ status: 400 });
    expect(await createServer(userId, { profileKey: "xonotic:base", slots: 6, name: "Six slots" })).toMatchObject({ status: 201 });
  });

  it("refuses starts on a suspended subscription and stops its running servers on reconcile", async () => {
    const id = await make("xonotic:base", 8);
    await startServer(userId, id);
    await DedicatedSubscription.updateOne({ _id: subId }, { $set: { status: "suspended" } });
    const other = await make("xonotic:base", 4);
    expect(await startServer(userId, other)).toMatchObject({ status: 403 });
    await reconcileDedicatedServers();
    expect(rooms.has(id)).toBe(false);
    expect(await used()).toBe(0);
    expect((await CommunityServer.findById(id).lean())?.runtimeState).toBe("stopped");
  });

  it("recovers a crashed server without changing its identity", async () => {
    const id = await make("xonotic:base", 8);
    await startServer(userId, id);
    const slug = (await CommunityServer.findById(id).lean())?.slug;
    rooms.delete(id); // crash
    await reconcileDedicatedServers();
    expect(rooms.has(id)).toBe(true);
    const after = await CommunityServer.findById(id).lean();
    expect(after?.slug).toBe(slug);
    expect(after?.desiredState).toBe("running");
    expect(await used()).toBe(8);
  });

  it("repairs a slot total left wrong by a crash", async () => {
    const id = await make("xonotic:base", 8);
    await startServer(userId, id);
    await DedicatedSubscription.updateOne({ _id: subId }, { $set: { allocatedSlots: 3 } });
    expect(await reconcileAllocations()).toBe(1);
    expect(await used()).toBe(8);
  });

  it("only deletes stopped servers", async () => {
    const id = await make("xonotic:base", 4);
    await startServer(userId, id);
    expect(await deleteServer(userId, id)).toMatchObject({ status: 409 });
    await stopServer(userId, id);
    expect(await deleteServer(userId, id)).toMatchObject({ ok: true });
  });
});
