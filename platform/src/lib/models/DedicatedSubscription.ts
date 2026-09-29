import { Schema, model, models } from "mongoose";

/**
 * A customer's PlayBound Dedicated entitlement: N concurrent player slots in
 * one region. PlayBound owns this record; Stripe (added in the billing phase)
 * is the billing authority and is synchronised into it, never read live.
 *
 * `allocatedSlots` is the running total of slots assigned to this
 * subscription's online servers. It only changes through the atomic
 * operations in dedicatedHosting/entitlement.ts, so two simultaneous starts
 * can never exceed `slotCapacity`; reconcile recomputes it from the servers.
 *
 * `source: "manual"` covers the gradual rollout: admin grants a subscription
 * before checkout exists. Billing fields stay null until then.
 */
const DedicatedSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tier: { type: String, required: true, default: "basic" },
    regionKey: { type: String, required: true },
    slotCapacity: { type: Number, required: true, min: 1 },
    allocatedSlots: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "past_due", "suspended", "canceled", "expired"],
      default: "active",
      index: true,
    },
    source: { type: String, enum: ["manual", "stripe"], default: "manual" },
    grantedBy: { type: String, default: null },
    note: { type: String, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    graceUntil: { type: Date, default: null },
    retainDataUntil: { type: Date, default: null },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    stripePriceId: { type: String, default: null },
    billingLastCheckedAt: { type: Date, default: null },
    billingLastError: { type: String, default: null },
    billingSnapshot: {
      slots: { type: Number, default: null },
      monthlyPriceCents: { type: Number, default: null },
      currency: { type: String, default: "usd" },
    },
  },
  { timestamps: true }
);

DedicatedSubscriptionSchema.index({ status: 1, regionKey: 1 });
DedicatedSubscriptionSchema.index({ stripeSubscriptionId: 1 }, { unique: true, partialFilterExpression: { stripeSubscriptionId: { $type: "string" } } });

export default models.DedicatedSubscription || model("DedicatedSubscription", DedicatedSubscriptionSchema);
