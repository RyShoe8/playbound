import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let metrics = {
  collectedAt: new Date().toISOString(),
  cpu: { cores: 8, usagePercent: 10 },
  memory: { totalBytes: 16 * 1024 ** 3, freeBytes: 12 * 1024 ** 3 },
  storage: [{ path: "/opt/playbound-host/games", totalBytes: 200 * 1024 ** 3, usedBytes: 20 * 1024 ** 3, freeBytes: 180 * 1024 ** 3, usedPercent: 10 }],
};
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/gameHost/client", () => ({
  fetchGameHostMetrics: async () => ({ ok: true, metrics }),
  listManagedHostRooms: async () => ({ ok: true, rooms: [] }),
}));
vi.mock("@/lib/requireAdmin", () => ({ requireAdminSession: async () => ({ session: { user: { id: "admin-test" } }, error: null }) }));

import User from "@/lib/models/User";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import DedicatedCapacityLease from "@/lib/models/DedicatedCapacityLease";
import DedicatedCapacityReservation from "@/lib/models/DedicatedCapacityReservation";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import { POST } from "@/app/api/admin/hosting/subscriptions/route";
import { PATCH } from "@/app/api/admin/hosting/subscriptions/[id]/route";

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "dedicated-admin-capacity-test" });
  await DedicatedCapacityLease.init();
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), DedicatedSubscription.deleteMany({}), DedicatedCapacityLease.deleteMany({}), DedicatedCapacityReservation.deleteMany({}), CommunityHostingConfig.deleteMany({})]);
  await CommunityHostingConfig.create({ key: "global", node: { regionKey: "us-central", enabled: true, draining: false }, budget: { cpuCores: 4, ramBytes: 8 * 1024 ** 3 } });
  metrics = { ...metrics, collectedAt: new Date().toISOString() };
});

async function user(name: string) {
  return User.create({ username: name, usernameNormalized: name.toLowerCase(), email: `${name}@example.com`, authProviders: ["google"] });
}
const grant = (name: string, slots: number) => POST(new Request("http://localhost/api/admin/hosting/subscriptions", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: name, slotCapacity: slots, regionKey: "us-central" }),
}));

describe("manual subscriptions share commercial capacity inventory", () => {
  it("finds a legacy username without usernameNormalized, ignoring case", async () => {
    const legacy = await user("LegacyHost");
    await User.collection.updateOne({ _id: legacy._id }, { $unset: { usernameNormalized: "" } });
    expect((await grant("legacyhost", 4)).status).toBe(201);
    const sub = await DedicatedSubscription.findOne().lean();
    expect(String(sub?.userId)).toBe(String(legacy._id));
  });

  it("refuses a grant that would oversell the remaining regional budget", async () => {
    await user("BuyerOne");
    await user("BuyerTwo");
    expect((await grant("BuyerOne", 16)).status).toBe(201);
    const reservation = await DedicatedCapacityReservation.findOne({ state: "active" }).lean();
    expect(reservation?.slots).toBe(16);
    expect(reservation?.cpuCores).toBe(2);
    expect((await grant("BuyerTwo", 16)).status).toBe(409);
    expect(await DedicatedSubscription.countDocuments()).toBe(1);
  });

  it("blocks an upward resize after the final slots are reserved", async () => {
    await user("BuyerThree");
    await user("BuyerFour");
    expect((await grant("BuyerThree", 16)).status).toBe(201);
    expect((await grant("BuyerFour", 8)).status).toBe(201);
    const sub = await DedicatedSubscription.findOne({ slotCapacity: 16 }).lean();
    const response = await PATCH(new Request("http://localhost/api/admin/hosting/subscriptions", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ slotCapacity: 24 }),
    }), { params: Promise.resolve({ id: String(sub!._id) }) });
    expect(response.status).toBe(409);
    expect((await DedicatedSubscription.findById(sub!._id).lean())?.slotCapacity).toBe(16);
  });

  it("refuses oversized Basic grants before reserving anything", async () => {
    await user("BuyerFive");
    expect((await grant("BuyerFive", 36)).status).toBe(400);
    expect(await DedicatedSubscription.countDocuments()).toBe(0);
  });

  it("fails closed when the VPS metrics are stale", async () => {
    await user("BuyerSix");
    metrics = { ...metrics, collectedAt: new Date(Date.now() - 600_000).toISOString() };
    expect((await grant("BuyerSix", 4)).status).toBe(409);
    expect(await DedicatedSubscription.countDocuments()).toBe(0);
  });

  it("releases one durable reservation when a manual grant is canceled", async () => {
    await user("BuyerSeven");
    expect((await grant("BuyerSeven", 8)).status).toBe(201);
    const sub = await DedicatedSubscription.findOne({ slotCapacity: 8 }).lean();
    const response = await PATCH(new Request("http://localhost/api/admin/hosting/subscriptions", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "canceled" }),
    }), { params: Promise.resolve({ id: String(sub!._id) }) });
    expect(response.status).toBe(200);
    const reservation = await DedicatedCapacityReservation.findOne({ subscriptionId: sub!._id }).lean();
    expect(reservation?.state).toBe("released");
    expect(reservation?.releasedAt).toBeInstanceOf(Date);
    expect(await DedicatedCapacityReservation.countDocuments({ subscriptionId: sub!._id })).toBe(1);
  });
  it("cannot mutate a Stripe subscription outside the billing workflow", async () => {
    const buyer = await user("PaidBuyer");
    const sub = await DedicatedSubscription.create({ userId: buyer._id, tier: "basic", regionKey: "us-central",
      slotCapacity: 8, status: "active", source: "stripe", stripeSubscriptionId: "sub_test_admin_guard" });
    for (const body of [{ slotCapacity: 16 }, { status: "canceled" }]) {
      const response = await PATCH(new Request("http://localhost/api/admin/hosting/subscriptions", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: String(sub._id) }) });
      expect(response.status).toBe(409);
    }
    const unchanged = await DedicatedSubscription.findById(sub._id);
    expect(unchanged?.slotCapacity).toBe(8);
    expect(unchanged?.status).toBe("active");
  });
});
