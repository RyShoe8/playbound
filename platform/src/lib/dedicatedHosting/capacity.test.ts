import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let metrics = {
  collectedAt: new Date().toISOString(),
  cpu: { cores: 8, usagePercent: 10 },
  memory: { totalBytes: 16 * 1024 ** 3, freeBytes: 12 * 1024 ** 3 },
  storage: [{ path: "/opt/playbound-host/games", totalBytes: 200 * 1024 ** 3, usedBytes: 20 * 1024 ** 3, freeBytes: 180 * 1024 ** 3, usedPercent: 10 }],
};
let managedRooms: Array<{ communityServerId: string; gameSlug: string; host: string; port: number; resources: { available: boolean; cpuCores: number; rssBytes: number } }> = [];
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/gameHost/client", () => ({
  fetchGameHostMetrics: async () => ({ ok: true, metrics }),
  listManagedHostRooms: async () => ({ ok: true, rooms: managedRooms }),
}));

import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import CommunityServer from "@/lib/models/CommunityServer";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import DedicatedCapacityLease from "@/lib/models/DedicatedCapacityLease";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { attachCheckoutSessionToHold, createCapacityHold, decideInventory, markCheckoutAttempt, regionalInventory, releaseCapacityHold } from "./capacity";
import { getTier } from "./tier";
import { paidReservedEnvelope } from "./reconcile";

let mongo: MongoMemoryServer;
const userId = new Types.ObjectId().toString();
const secondUserId = new Types.ObjectId().toString();
const gib = 1024 ** 3;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "dedicated-capacity-test" });
  await Promise.all([DedicatedCapacityHold.init(), DedicatedCapacityLease.init()]);
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([DedicatedCapacityHold.deleteMany({}), DedicatedCapacityLease.deleteMany({}), DedicatedSubscription.deleteMany({}), CommunityHostingConfig.deleteMany({}), CommunityServer.deleteMany({})]);
  await CommunityHostingConfig.create({ key: "global", node: { regionKey: "us-central", enabled: true, draining: false }, budget: { cpuCores: 4, ramBytes: 8 * gib }, safety: { maxCpuPercent: 80, maxRamPercent: 85, minFreeRamBytes: gib, maxMetricsAgeSeconds: 120 } });
  metrics = { ...metrics, collectedAt: new Date().toISOString(), cpu: { cores: 8, usagePercent: 10 } };
  managedRooms = [];
});

describe("Dedicated Basic capacity holds", () => {
  it("keeps a fifteen-minute hold and excludes it from free-server inventory", async () => {
    const hold = await createCapacityHold({ userId, regionKey: "us-central", slots: 16, checkoutKey: "checkout-one" });
    expect(hold.expiresAt.getTime() - hold.createdAt.getTime()).toBeGreaterThan(14 * 60_000);
    expect((await regionalInventory("us-central")).availableSlots).toBe(8);
    expect(await paidReservedEnvelope("us-central")).toEqual({ cpuCores: 2, ramBytes: 4 * gib });
    await DedicatedCapacityHold.updateOne({ _id: hold._id }, { $set: { expiresAt: new Date(0) } });
    expect((await regionalInventory("us-central")).availableSlots).toBe(24);
    expect(await paidReservedEnvelope("us-central")).toEqual({ cpuCores: 0, ramBytes: 0 });
  });

  it("extends a pre-checkout hold through Stripe's minimum session lifetime and releases it on expiry", async () => {
    const now = new Date();
    const hold = await createCapacityHold({ userId, regionKey: "us-central", slots: 8, checkoutKey: "checkout-session" }, now);
    const sessionExpiresAt = new Date(now.getTime() + 30 * 60_000);
    const attached = await attachCheckoutSessionToHold(String(hold._id), "cs_test_checkout1", sessionExpiresAt, now);
    expect(attached.expiresAt.getTime()).toBe(sessionExpiresAt.getTime() + 5 * 60_000);
    expect(await releaseCapacityHold(String(hold._id))).toBe(true);
    expect((await regionalInventory("us-central")).availableSlots).toBe(24);
  });

  it("keeps one stable requested Stripe expiry across retries", async () => {
    const hold = await createCapacityHold({ userId, regionKey: "us-central", slots: 8, checkoutKey: "checkout-retry", stripePriceId: "price_8", monthlyPriceCents: 1299, currency: "usd" });
    const first = await markCheckoutAttempt(String(hold._id));
    const second = await markCheckoutAttempt(String(hold._id), new Date(Date.now() + 60_000));
    expect(second.requestedSessionExpiresAt.getTime()).toBe(first.requestedSessionExpiresAt.getTime());
    expect(second.expiresAt.getTime()).toBe(first.requestedSessionExpiresAt.getTime() + 5 * 60_000);
    expect((await regionalInventory("us-central")).availableSlots).toBe(16);
    await expect(createCapacityHold({ userId, regionKey: "us-central", slots: 8, checkoutKey: "checkout-retry", stripePriceId: "price_changed", monthlyPriceCents: 1299, currency: "usd" })).rejects.toThrow("another request");
  });

  it("serializes racing buyers of the last 16 slots", async () => {
    await DedicatedSubscription.create({ userId: new Types.ObjectId(), tier: "basic", regionKey: "us-central", slotCapacity: 8, status: "active" });
    const results = await Promise.allSettled([
      createCapacityHold({ userId, regionKey: "us-central", slots: 16, checkoutKey: "checkout-two" }),
      createCapacityHold({ userId: secondUserId, regionKey: "us-central", slots: 16, checkoutKey: "checkout-three" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await DedicatedCapacityHold.countDocuments({ state: "held" })).toBe(1);
  });

  it("is idempotent for the same checkout request and rejects key reuse by another user", async () => {
    const input = { userId, regionKey: "us-central", slots: 8, checkoutKey: "checkout-four" };
    const first = await createCapacityHold(input);
    expect(String((await createCapacityHold(input))._id)).toBe(String(first._id));
    await expect(createCapacityHold({ ...input, userId: secondUserId })).rejects.toThrow("another request");
    await expect(createCapacityHold({ ...input, checkoutKey: "checkout-other" })).rejects.toThrow("active checkout");
  });

  it("keeps canceled subscriptions' still-running rooms charged until they stop", async () => {
    const sub = await DedicatedSubscription.create({ userId, tier: "basic", regionKey: "us-central", slotCapacity: 16, status: "canceled" });
    const room = await CommunityServer.create({
      slug: "capacity-canceled-room", name: "Stopping room", gameSlug: "xonotic", regionKey: "us-central", profileKey: "xonotic:base",
      ownerType: "user", ownerId: userId, dedicatedSubscriptionId: sub._id, allocatedSlots: 0, maxPlayerCount: 16, slotsHeld: false,
      desiredState: "stopped", runtimeState: "running",
    });
    expect((await regionalInventory("us-central")).availableSlots).toBe(8);
    await CommunityServer.updateOne({ _id: room._id }, { $set: { runtimeState: "stopped", slotsHeld: false } });
    expect((await regionalInventory("us-central")).availableSlots).toBe(24);
  });

  it("releases a suspended subscription only after its runtime has stopped", async () => {
    const sub = await DedicatedSubscription.create({ userId, tier: "basic", regionKey: "us-central", slotCapacity: 16, status: "suspended" });
    expect((await regionalInventory("us-central")).availableSlots).toBe(24);
    const room = await CommunityServer.create({
      slug: "capacity-suspended-room", name: "Stopping room", gameSlug: "xonotic", regionKey: "us-central", profileKey: "xonotic:base",
      ownerType: "user", ownerId: userId, dedicatedSubscriptionId: sub._id, allocatedSlots: 8, maxPlayerCount: 8, slotsHeld: true,
      desiredState: "stopped", runtimeState: "running",
    });
    expect((await regionalInventory("us-central")).availableSlots).toBe(16);
    expect(await paidReservedEnvelope("us-central")).toEqual({ cpuCores: 2, ramBytes: 4 * gib });
    await CommunityServer.updateOne({ _id: room._id }, { $set: { runtimeState: "stopped", slotsHeld: false } });
    expect((await regionalInventory("us-central")).availableSlots).toBe(24);
    expect(await paidReservedEnvelope("us-central")).toEqual({ cpuCores: 0, ramBytes: 0 });
  });

  it("fails closed on stale metrics and an unhealthy node", async () => {
    metrics = { ...metrics, collectedAt: new Date(Date.now() - 10 * 60_000).toISOString() };
    await expect(createCapacityHold({ userId, regionKey: "us-central", slots: 4, checkoutKey: "checkout-five" })).rejects.toThrow("STALE_OR_MISSING_METRICS");
    expect(await DedicatedCapacityHold.countDocuments()).toBe(0);
    metrics = { ...metrics, collectedAt: new Date().toISOString(), cpu: { cores: 8, usagePercent: 90 } };
    expect((await regionalInventory("us-central")).reason).toBe("NODE_AT_SAFETY_LIMIT");
  });

  it("reserves configured CPU, RAM and disk with the safety margin", async () => {
    const tier = await getTier();
    const decision = decideInventory({
      tier,
      budget: { cpuCores: 4, ramBytes: 8 * gib, storageBytes: 20 * gib },
      metrics,
      maxMetricsAgeSeconds: 120,
      maxCpuPercent: 80,
      maxRamPercent: 85,
      minFreeRamBytes: gib,
      occupied: [],
      now: new Date(),
    });
    expect(decision.availableSlots).toBe(12); // 20 GB less 15% reserve = three 5 GB units.
  });

  it("sells paid capacity while free community rooms are running, even when occupancy is unknown", async () => {
    for (let i = 0; i < 5; i++) {
      const server = await CommunityServer.create({ slug: `idle-arena-${i}`, name: `Idle arena ${i}`,
        gameSlug: "openarena", profileKey: "openarena:base", regionKey: "us-central",
        desiredState: "running", runtimeState: "running", ownerType: "community" });
      managedRooms.push({ communityServerId: String(server._id), gameSlug: "openarena", host: "127.0.0.1", port: 27000 + i,
        resources: { available: true, cpuCores: 0.02, rssBytes: 64 * 1024 ** 2 } });
    }
    expect((await regionalInventory("us-central")).availableSlots).toBe(24);
    const hold = await createCapacityHold({ userId, regionKey: "us-central", slots: 4, checkoutKey: "idle-room-checkout" });
    expect(hold.state).toBe("held");
    expect((await regionalInventory("us-central")).availableSlots).toBe(20);
  });

  it("does not charge free pending starts against paid inventory", async () => {
    const server = await CommunityServer.create({ slug: "stale-tf2", name: "Stale TF2", gameSlug: "team-fortress-2",
      profileKey: "team-fortress-2:base", regionKey: "us-central", ownerType: "community",
      desiredState: "running", runtimeState: "running" });
    expect((await regionalInventory("us-central")).availableSlots).toBe(24);
    await CommunityServer.updateOne({ _id: server._id }, { $set: { runtimeState: "pending" } });
    expect((await regionalInventory("us-central")).availableSlots).toBe(24);
  });
});
