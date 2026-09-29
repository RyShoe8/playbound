import { Schema, model, models } from "mongoose";

/** Temporary regional reservation before Stripe Checkout. Query expiry in code:
 * converted/released records are retained for billing audit, not TTL-deleted.
 */
const DedicatedCapacityHoldSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tier: { type: String, required: true, default: "basic" },
  regionKey: { type: String, required: true },
  slots: { type: Number, required: true, min: 1 },
  checkoutKey: { type: String, required: true, unique: true },
  checkoutSessionId: { type: String, default: null },
  requestedSessionExpiresAt: { type: Date, default: null },
  // Immutable commercial terms captured before sending a customer to Stripe.
  stripePriceId: { type: String, default: null },
  monthlyPriceCents: { type: Number, default: null },
  currency: { type: String, default: null },
  state: { type: String, enum: ["held", "converted", "released"], default: "held" },
  expiresAt: { type: Date, required: true },
  convertedAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
}, { timestamps: true });

DedicatedCapacityHoldSchema.index({ regionKey: 1, state: 1, expiresAt: 1 });
DedicatedCapacityHoldSchema.index({ userId: 1, state: 1, expiresAt: 1 });
DedicatedCapacityHoldSchema.index({ checkoutSessionId: 1 }, { unique: true, partialFilterExpression: { checkoutSessionId: { $type: "string" } } });

export default models.DedicatedCapacityHold || model("DedicatedCapacityHold", DedicatedCapacityHoldSchema);
