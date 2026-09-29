import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const stripe = vi.hoisted(() => ({ customer: "cus_test", cancel: false, writes: [] as boolean[], priceId: "price_basic_8", upgradeWrites: [] as string[], upgradeError: 0, scheduleError: false, scheduleWrites: 0, releaseWrites: 0 }));
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("./tier", () => ({ getTier: async () => ({ packages: [{ slots: 8, enabled: true, stripePriceId: "price_basic_8", priceCents: 1299, currency: "usd" }, { slots: 12, enabled: true, stripePriceId: "price_basic_12", priceCents: 1799, currency: "usd" }] }) }));
vi.mock("./capacity", () => ({
  withRegionCapacityLease: async (_region: string, work: () => Promise<unknown>) => work(),
  regionalInventory: async () => ({ availableSlots: 16 }),
  releaseCapacityHold: async (id: string) => { await DedicatedCapacityHold.updateOne({ _id: id }, { $set: { state: "released" } }); },
}));
vi.mock("./stripeBillingRemote", () => ({
  retrieveBillingSubscription: async () => ({ id: "sub_test", customer: stripe.customer, status: "active", cancel_at_period_end: stripe.cancel, metadata: { playbound_hold_id: "hold_test" }, items: { data: [{ id: "si_test", quantity: 1, price: { id: stripe.priceId }, current_period_end: Math.floor(Date.now() / 1000) + 25 * 86400 }] } }),
  setStripeCancelAtPeriodEnd: async (_id: string, cancel: boolean) => { stripe.writes.push(cancel); stripe.cancel = cancel; },
  applyPaidUpgrade: async (_subId: string, _itemId: string, priceId: string) => {
    expect(await DedicatedCapacityHold.countDocuments({ state: "held", planChangeSubscriptionId: { $type: "objectId" } })).toBe(1);
    stripe.upgradeWrites.push(priceId);
    if (stripe.upgradeError === 504) { stripe.priceId = priceId; throw Object.assign(new Error("Response lost"), { statusCode: 504 }); }
    if (stripe.upgradeError) throw Object.assign(new Error("Stripe unavailable"), { statusCode: stripe.upgradeError });
    stripe.priceId = priceId;
  },
  ensureStripeDowngrade: async (input: { currentPeriodEnd: number }) => {
    stripe.scheduleWrites++;
    if (stripe.scheduleError) throw new Error("Response lost");
    return { scheduleId: "sub_sched_test", effectiveAt: new Date(input.currentPeriodEnd * 1000) };
  },
  releaseStripeDowngrade: async () => { stripe.releaseWrites++; },
}));
vi.mock("./billingEvents", () => ({ syncDedicatedStripeSubscription: async () => {
  await DedicatedSubscription.updateOne({ stripeSubscriptionId: "sub_test" }, { $set: { cancelAtPeriodEnd: stripe.cancel, ...(stripe.priceId === "price_basic_12" ? { slotCapacity: 12, stripePriceId: stripe.priceId } : {}) } });
  if (stripe.priceId === "price_basic_12") await DedicatedCapacityHold.updateOne({ state: "held", planChangeSubscriptionId: { $type: "objectId" } }, { $set: { state: "converted" } });
} }));
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import { scheduleCustomerDowngrade, setCustomerCancellation, upgradeCustomerPlan } from "./customerBilling";

let mongo: MongoMemoryServer;
const owner = new Types.ObjectId().toString();
const stranger = new Types.ObjectId().toString();
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { dbName: "customer-billing-test" }); }, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await DedicatedSubscription.deleteMany({});
  await DedicatedCapacityHold.deleteMany({});
  stripe.customer = "cus_test"; stripe.cancel = false; stripe.writes = []; stripe.priceId = "price_basic_8"; stripe.upgradeWrites = []; stripe.upgradeError = 0; stripe.scheduleError = false; stripe.scheduleWrites = 0; stripe.releaseWrites = 0;
  await DedicatedSubscription.create({ userId: owner, tier: "basic", regionKey: "us-central", slotCapacity: 8, source: "stripe", stripeSubscriptionId: "sub_test", stripeCustomerId: "cus_test", stripePriceId: "price_basic_8" });
});

describe("scheduled downgrades", () => {
  beforeEach(async () => {
    stripe.priceId = "price_basic_12";
    await DedicatedSubscription.updateOne({ userId: owner }, { $set: { slotCapacity: 12, stripePriceId: "price_basic_12" } });
  });
  it("refuses an active allocation that exceeds the requested size", async () => {
    await DedicatedSubscription.updateOne({ userId: owner }, { $set: { allocatedSlots: 12 } });
    expect(await scheduleCustomerDowngrade(owner, 8)).toMatchObject({ status: 409 });
    expect(stripe.scheduleWrites).toBe(0);
  });
  it("records a smaller cap before scheduling Stripe and survives a lost response", async () => {
    stripe.scheduleError = true;
    await expect(scheduleCustomerDowngrade(owner, 8)).rejects.toThrow("Response lost");
    expect((await DedicatedSubscription.findOne({ userId: owner }))?.scheduledChange?.targetSlots).toBe(8);
    stripe.scheduleError = false;
    expect(await scheduleCustomerDowngrade(owner, 8)).toMatchObject({ status: 200, slots: 8 });
    expect((await DedicatedSubscription.findOne({ userId: owner }))?.scheduledChange?.state).toBe("scheduled");
    expect(stripe.scheduleWrites).toBe(2);
  });
  it("releases a scheduled downgrade before canceling at period end", async () => {
    expect(await scheduleCustomerDowngrade(owner, 8)).toMatchObject({ status: 200 });
    expect(await setCustomerCancellation(owner, true)).toMatchObject({ status: 200, cancelAtPeriodEnd: true });
    expect(stripe.releaseWrites).toBe(1);
    expect((await DedicatedSubscription.findOne({ userId: owner }))?.scheduledChange).toBeNull();
  });
});

describe("customer upgrades", () => {
  it("reserves delta slots before calling Stripe and applies the paid package", async () => {
    expect(await upgradeCustomerPlan(owner, 12)).toMatchObject({ status: 200, slots: 12 });
    expect(stripe.upgradeWrites).toEqual(["price_basic_12"]);
    expect(await DedicatedCapacityHold.countDocuments({ state: "converted", slots: 4 })).toBe(1);
  });
  it("releases capacity after a definitive payment rejection", async () => {
    stripe.upgradeError = 402;
    await expect(upgradeCustomerPlan(owner, 12)).rejects.toThrow("Stripe unavailable");
    expect(await DedicatedCapacityHold.countDocuments({ state: "released", slots: 4 })).toBe(1);
    expect((await DedicatedSubscription.findOne({ userId: owner }))?.slotCapacity).toBe(8);
  });
  it("keeps capacity reserved after an uncertain Stripe failure", async () => {
    stripe.upgradeError = 503;
    await expect(upgradeCustomerPlan(owner, 12)).rejects.toThrow("Stripe unavailable");
    expect(await DedicatedCapacityHold.countDocuments({ state: "held", slots: 4 })).toBe(1);
    expect(await upgradeCustomerPlan(stranger, 12)).toMatchObject({ status: 404 });
  });
  it("reconciles a successful remote upgrade after its response was lost", async () => {
    stripe.upgradeError = 504;
    await expect(upgradeCustomerPlan(owner, 12)).rejects.toThrow("Response lost");
    expect(await DedicatedCapacityHold.countDocuments({ state: "held", slots: 4 })).toBe(1);
    expect(await upgradeCustomerPlan(owner, 12)).toMatchObject({ status: 200, slots: 12 });
    expect(stripe.upgradeWrites).toEqual(["price_basic_12"]);
    expect(await DedicatedCapacityHold.countDocuments({ state: "converted", slots: 4 })).toBe(1);
  });
});

describe("customer cancellation", () => {
  it("only changes the owner's Stripe subscription and is idempotent", async () => {
    expect(await setCustomerCancellation(stranger, true)).toMatchObject({ status: 404 });
    expect(await setCustomerCancellation(owner, true)).toMatchObject({ status: 200, cancelAtPeriodEnd: true });
    expect(await setCustomerCancellation(owner, true)).toMatchObject({ status: 200, cancelAtPeriodEnd: true });
    expect(stripe.writes).toEqual([true]);
    expect(await setCustomerCancellation(owner, false)).toMatchObject({ status: 200, cancelAtPeriodEnd: false });
    expect(stripe.writes).toEqual([true, false]);
  });
  it("refuses to update a mismatched Stripe customer", async () => {
    stripe.customer = "cus_other";
    expect(await setCustomerCancellation(owner, true)).toMatchObject({ status: 409 });
    expect(stripe.writes).toEqual([]);
  });
});
