import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const stripe = vi.hoisted(() => ({ customer: "cus_test", cancel: false, writes: [] as boolean[] }));
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("./stripeBillingRemote", () => ({
  retrieveBillingSubscription: async () => ({ id: "sub_test", customer: stripe.customer, status: "active", cancel_at_period_end: stripe.cancel, metadata: { playbound_hold_id: "hold_test" } }),
  setStripeCancelAtPeriodEnd: async (_id: string, cancel: boolean) => { stripe.writes.push(cancel); stripe.cancel = cancel; },
}));
vi.mock("./billingEvents", () => ({ syncDedicatedStripeSubscription: async () => { await DedicatedSubscription.updateOne({ stripeSubscriptionId: "sub_test" }, { $set: { cancelAtPeriodEnd: stripe.cancel } }); } }));
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { setCustomerCancellation } from "./customerBilling";

let mongo: MongoMemoryServer;
const owner = new Types.ObjectId().toString();
const stranger = new Types.ObjectId().toString();
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { dbName: "customer-billing-test" }); }, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await DedicatedSubscription.deleteMany({});
  stripe.customer = "cus_test"; stripe.cancel = false; stripe.writes = [];
  await DedicatedSubscription.create({ userId: owner, tier: "basic", regionKey: "us-central", slotCapacity: 8, source: "stripe", stripeSubscriptionId: "sub_test", stripeCustomerId: "cus_test" });
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
