import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type Stripe from "stripe";

const remote = vi.hoisted(() => ({ priceId: "price_basic_8", paid: true, status: "active" }));
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/gameHost/client", () => ({ fetchGameHostMetrics: async () => ({ ok: true, metrics: {
  collectedAt: new Date().toISOString(), cpu: { cores: 8, usagePercent: 10 },
  memory: { totalBytes: 16 * 1024 ** 3, freeBytes: 12 * 1024 ** 3 },
  storage: [{ path: "/games", freeBytes: 100 * 1024 ** 3, usedBytes: 0, totalBytes: 100 * 1024 ** 3 }],
} }) }));
vi.mock("./stripeBillingRemote", () => ({ retrieveCompletedCheckout: async (sessionId: string) => {
  if (!remote.paid) throw new Error("Checkout is not paid");
  return { id: sessionId, customer: "cus_test_1", subscription: "sub_test_1", client_reference_id: userId,
    metadata: { playbound_hold_id: String(holdId) } };
}, retrievePaidCheckout: async (sessionId: string) => {
  if (!remote.paid) throw new Error("Checkout is not paid");
  return {
    session: { id: sessionId, customer: "cus_test_1", client_reference_id: userId,
      metadata: { playbound_hold_id: String(holdId) } },
    subscription: { id: "sub_test_1", customer: "cus_test_1", status: "active", cancel_at_period_end: false,
      metadata: { playbound_hold_id: String(holdId) }, items: { data: [{ quantity: 1,
        price: { id: remote.priceId, unit_amount: 1299, currency: "usd" },
        current_period_start: 1_800_000_000, current_period_end: 1_802_592_000 }] } },
  };
}, retrieveCheckoutStatus: async () => ({ status: "complete", paymentStatus: remote.paid ? "paid" : "unpaid" }),
retrieveBillingSubscription: async () => ({ id: "sub_test_1", customer: "cus_test_1", status: remote.status,
  cancel_at_period_end: false, metadata: { playbound_hold_id: String(holdId) },
  items: { data: [{ quantity: 1, price: { id: remote.priceId, unit_amount: remote.priceId === "price_basic_12" ? 1799 : remote.priceId === "price_basic_4" ? 799 : 1299, currency: "usd" }, current_period_start: 1_800_000_000, current_period_end: 1_802_592_000 }] },
}) }));

import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import DedicatedCapacityLease from "@/lib/models/DedicatedCapacityLease";
import DedicatedCapacityReservation from "@/lib/models/DedicatedCapacityReservation";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import StripeWebhookReceipt from "@/lib/models/StripeWebhookReceipt";
import { processDedicatedStripeEvent, syncDedicatedStripeSubscription } from "./billingEvents";
import { reconcileDedicatedBilling } from "./billingReconcile";

let mongo: MongoMemoryServer;
const userId = new Types.ObjectId().toString();
let holdId: Types.ObjectId;
const event = (id: string, type = "checkout.session.completed") => ({
  id, type, data: { object: { id: "cs_test_1", metadata: { playbound_hold_id: String(holdId) } } },
}) as unknown as Stripe.Event;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "billing-events-test" });
  await Promise.all([DedicatedCapacityHold.init(), DedicatedCapacityLease.init(), DedicatedSubscription.init(), DedicatedCapacityReservation.init(), StripeWebhookReceipt.init()]);
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([DedicatedCapacityHold.deleteMany({}), DedicatedCapacityLease.deleteMany({}), DedicatedSubscription.deleteMany({}), DedicatedCapacityReservation.deleteMany({}), StripeWebhookReceipt.deleteMany({}), CommunityHostingConfig.deleteMany({})]);
  remote.priceId = "price_basic_8";
  remote.paid = true;
  remote.status = "active";
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  holdId = new Types.ObjectId();
  await DedicatedCapacityHold.create({ _id: holdId, userId, tier: "basic", regionKey: "us-central", slots: 8,
    checkoutKey: "billing-event-test", checkoutSessionId: "cs_test_1", stripePriceId: "price_basic_8",
    monthlyPriceCents: 1299, currency: "usd", state: "held", expiresAt: new Date(Date.now() + 30 * 60_000) });
  await CommunityHostingConfig.create({ key: "global", node: { regionKey: "us-central", enabled: true, draining: false },
    budget: { cpuCores: 4, ramBytes: 8 * 1024 ** 3 }, safety: { maxCpuPercent: 80, maxRamPercent: 85,
      minFreeRamBytes: 1024 ** 3, maxMetricsAgeSeconds: 120 } });
});

describe("Dedicated Basic paid-event conversion", () => {
  it("creates one subscription and one reservation even after replay and distinct duplicate events", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    await processDedicatedStripeEvent(event("evt_paid_1"));
    await processDedicatedStripeEvent(event("evt_paid_2"));
    expect(await DedicatedSubscription.countDocuments()).toBe(1);
    expect(await DedicatedCapacityReservation.countDocuments({ state: "active", slots: 8 })).toBe(1);
    expect(await StripeWebhookReceipt.countDocuments()).toBe(2);
    expect((await DedicatedCapacityHold.findById(holdId))?.state).toBe("converted");
    const sub = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    expect(sub?.billingSnapshot.monthlyPriceCents).toBe(1299);
    expect(sub?.source).toBe("stripe");
  });
  it("serializes two distinct paid events delivered concurrently", async () => {
    await Promise.all([processDedicatedStripeEvent(event("evt_race_1")), processDedicatedStripeEvent(event("evt_race_2"))]);
    expect(await DedicatedSubscription.countDocuments()).toBe(1);
    expect(await DedicatedCapacityReservation.countDocuments()).toBe(1);
    expect(await StripeWebhookReceipt.countDocuments()).toBe(2);
  });
  it("does not grant access for a different Stripe price or an unpaid Checkout", async () => {
    remote.priceId = "price_other";
    await expect(processDedicatedStripeEvent(event("evt_wrong_price"))).rejects.toThrow("price does not match");
    remote.priceId = "price_basic_8";
    remote.paid = false;
    await expect(processDedicatedStripeEvent(event("evt_unpaid"))).rejects.toThrow("not paid");
    expect(await DedicatedSubscription.countDocuments()).toBe(0);
    expect(await StripeWebhookReceipt.countDocuments()).toBe(0);
    expect((await DedicatedCapacityHold.findById(holdId))?.state).toBe("held");
  });
  it("rechecks capacity before honoring a delayed paid event after its hold expired", async () => {
    await DedicatedCapacityHold.updateOne({ _id: holdId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await DedicatedSubscription.create({ userId: new Types.ObjectId(), tier: "basic", regionKey: "us-central", slotCapacity: 24, status: "active" });
    await expect(processDedicatedStripeEvent(event("evt_delayed_paid"))).rejects.toThrow("capacity is unavailable");
    expect(await DedicatedSubscription.countDocuments({ source: "stripe" })).toBe(0);
    expect((await DedicatedCapacityHold.findById(holdId))?.state).toBe("held");
  });
  it("releases a matching expired session, then rejects a late paid event", async () => {
    await processDedicatedStripeEvent(event("evt_expired_1", "checkout.session.expired"));
    await processDedicatedStripeEvent(event("evt_expired_1", "checkout.session.expired"));
    expect((await DedicatedCapacityHold.findById(holdId))?.state).toBe("released");
    await expect(processDedicatedStripeEvent(event("evt_late_paid"))).rejects.toThrow("does not match");
    expect(await DedicatedSubscription.countDocuments()).toBe(0);
  });
  it("reconciles renewal, payment failure, and recovery from authoritative Stripe state", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    const invoiceEvent = (id: string, type: string) => ({ id, type, data: { object: { id: "in_test_1", parent: { subscription_details: { subscription: "sub_test_1" } } } } }) as unknown as Stripe.Event;
    remote.status = "past_due";
    await processDedicatedStripeEvent(invoiceEvent("evt_fail_1", "invoice.payment_failed"));
    const afterFailure = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    expect(afterFailure?.status).toBe("past_due");
    expect(afterFailure?.graceUntil).toBeTruthy();
    remote.status = "active";
    await processDedicatedStripeEvent(invoiceEvent("evt_renewal_1", "invoice.paid"));
    const recovered = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    expect(recovered?.status).toBe("active");
    expect(recovered?.graceUntil).toBeNull();
    expect(await StripeWebhookReceipt.countDocuments()).toBe(3);
  });
  it("ends access on Stripe cancellation and retains saved data", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    remote.status = "canceled";
    const deleted = { id: "evt_deleted_1", type: "customer.subscription.deleted", data: { object: { id: "sub_test_1" } } } as unknown as Stripe.Event;
    await processDedicatedStripeEvent(deleted);
    const sub = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    expect(sub?.status).toBe("canceled");
    expect(sub?.retainDataUntil?.getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 60 * 60_000);
    expect(await DedicatedCapacityReservation.countDocuments({ state: "released" })).toBe(1);
  });
  it("suspends after the configured payment grace and recovers when paid", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    remote.status = "past_due";
    const updated = (id: string) => ({ id, type: "customer.subscription.updated", data: { object: { id: "sub_test_1" } } }) as unknown as Stripe.Event;
    await processDedicatedStripeEvent(updated("evt_due_1"));
    await DedicatedSubscription.updateOne({ stripeSubscriptionId: "sub_test_1" }, { $set: { graceUntil: new Date(Date.now() - 1000) } });
    await processDedicatedStripeEvent(updated("evt_due_2"));
    expect((await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" }))?.status).toBe("suspended");
    remote.status = "active";
    expect(await reconcileDedicatedBilling()).toEqual({ checked: 1, failed: 0, scanned: 1, recovered: 0, scannedHolds: 0 });
    const recovered = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    expect(recovered?.status).toBe("active");
    expect(recovered?.graceUntil).toBeNull();
  });
  it("recovers a paid Checkout even when its completion webhook was missed", async () => {
    expect(await reconcileDedicatedBilling()).toEqual({ checked: 0, failed: 0, scanned: 0, recovered: 1, scannedHolds: 1 });
    expect(await DedicatedSubscription.countDocuments()).toBe(1);
    expect(await DedicatedCapacityReservation.countDocuments()).toBe(1);
    expect((await DedicatedCapacityHold.findById(holdId))?.state).toBe("converted");
    await processDedicatedStripeEvent(event("evt_arrived_late"));
    expect(await DedicatedSubscription.countDocuments()).toBe(1);
  });
  it("does not fail the scheduled scan while billing is unconfigured and unused", async () => {
    await DedicatedCapacityHold.deleteMany({});
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await reconcileDedicatedBilling()).toEqual({ checked: 0, failed: 0, scanned: 0, recovered: 0, scannedHolds: 0 });
  });
  it("does not oversell when a suspended customer's payment recovers after capacity was resold", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    await DedicatedSubscription.updateOne({ stripeSubscriptionId: "sub_test_1" }, { $set: { status: "suspended" } });
    await DedicatedSubscription.create({ userId: new Types.ObjectId(), tier: "basic", regionKey: "us-central", slotCapacity: 24, status: "active" });
    await expect(reconcileDedicatedBilling()).resolves.toMatchObject({ checked: 0, failed: 1 });
    expect((await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" }))?.status).toBe("suspended");
  });
  it("applies only a price change backed by a reserved upgrade delta", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    remote.priceId = "price_basic_12";
    await expect(syncDedicatedStripeSubscription("sub_test_1")).rejects.toThrow("capacity-reserved");
    expect((await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" }))?.slotCapacity).toBe(8);
    const sub = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    const upgrade = await DedicatedCapacityHold.create({
      userId, tier: "basic", regionKey: "us-central", slots: 4, checkoutKey: "upgrade-test-key",
      planChangeSubscriptionId: sub!._id, fromSlots: 8, toSlots: 12,
      stripePriceId: "price_basic_12", monthlyPriceCents: 1799, currency: "usd", state: "held",
      expiresAt: new Date(Date.now() - 1000),
    });
    // Upgrade holds remain in inventory even after the ordinary checkout
    // expiry, until Stripe and the local reservation agree.
    await syncDedicatedStripeSubscription("sub_test_1");
    const updated = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    expect(updated?.slotCapacity).toBe(12);
    expect(updated?.stripePriceId).toBe("price_basic_12");
    expect(updated?.billingSnapshot.monthlyPriceCents).toBe(1799);
    expect((await DedicatedCapacityHold.findById(upgrade._id))?.state).toBe("converted");
    expect((await DedicatedCapacityReservation.findOne({ subscriptionId: updated?._id }))?.slots).toBe(12);
    await syncDedicatedStripeSubscription("sub_test_1");
    expect(await DedicatedCapacityReservation.countDocuments()).toBe(1);
    await processDedicatedStripeEvent(event("evt_original_checkout_replayed_late"));
    expect(await DedicatedSubscription.countDocuments()).toBe(1);
    expect(await StripeWebhookReceipt.countDocuments({ eventId: "evt_original_checkout_replayed_late" })).toBe(1);
  });
  it("repairs a Checkout conversion interrupted after the subscription write", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    await DedicatedCapacityHold.updateOne({ _id: holdId }, { $set: { state: "held", checkoutSessionId: null, convertedAt: null } });
    await processDedicatedStripeEvent(event("evt_recovery_1"));
    expect((await DedicatedCapacityHold.findById(holdId))?.state).toBe("converted");
    expect(await DedicatedSubscription.countDocuments()).toBe(1);
    expect(await DedicatedCapacityReservation.countDocuments()).toBe(1);
  });
  it("applies a scheduled downgrade at renewal and releases reserved capacity", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    await DedicatedSubscription.updateOne({ stripeSubscriptionId: "sub_test_1" }, { $set: { scheduledChange: {
      targetSlots: 4, stripePriceId: "price_basic_4", monthlyPriceCents: 799, currency: "usd",
      effectiveAt: new Date(Date.now() + 60 * 60_000), requestKey: "downgrade-test", state: "scheduled", scheduleId: "sub_sched_test",
    } } });
    remote.priceId = "price_basic_4";
    await expect(syncDedicatedStripeSubscription("sub_test_1")).rejects.toThrow("capacity-reserved");
    await DedicatedSubscription.updateOne({ stripeSubscriptionId: "sub_test_1" }, { $set: { "scheduledChange.effectiveAt": new Date(Date.now() - 60_000) } });
    await syncDedicatedStripeSubscription("sub_test_1");
    const sub = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    expect(sub?.slotCapacity).toBe(4);
    expect(sub?.stripePriceId).toBe("price_basic_4");
    expect(sub?.scheduledChange).toBeNull();
    expect((await DedicatedCapacityReservation.findOne({ subscriptionId: sub?._id }))?.slots).toBe(4);
  });
  it("applies the smaller slot cap even when the first downgraded invoice fails", async () => {
    await processDedicatedStripeEvent(event("evt_paid_1"));
    await DedicatedSubscription.updateOne({ stripeSubscriptionId: "sub_test_1" }, { $set: { scheduledChange: {
      targetSlots: 4, stripePriceId: "price_basic_4", monthlyPriceCents: 799, currency: "usd",
      effectiveAt: new Date(Date.now() - 60_000), requestKey: "downgrade-failed-payment", state: "scheduled",
    } } });
    remote.priceId = "price_basic_4";
    remote.status = "past_due";
    await syncDedicatedStripeSubscription("sub_test_1");
    const sub = await DedicatedSubscription.findOne({ stripeSubscriptionId: "sub_test_1" });
    expect(sub?.slotCapacity).toBe(4);
    expect(sub?.status).toBe("past_due");
    expect(sub?.graceUntil).toBeTruthy();
  });
});
