import { Schema, model, models } from "mongoose";

/** One durable regional infrastructure reservation per Dedicated subscription.
 * The subscription remains counted as a fail-safe if this mirror is missing.
 */
const DedicatedCapacityReservationSchema = new Schema({
  subscriptionId: { type: Schema.Types.ObjectId, ref: "DedicatedSubscription", required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  tier: { type: String, required: true },
  regionKey: { type: String, required: true, index: true },
  slots: { type: Number, required: true, min: 1 },
  cpuCores: { type: Number, required: true, min: 0 },
  ramBytes: { type: Number, required: true, min: 0 },
  storageBytes: { type: Number, required: true, min: 0 },
  state: { type: String, enum: ["active", "releasing", "released"], required: true, default: "active" },
  releasedAt: { type: Date, default: null },
  lastSyncedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

DedicatedCapacityReservationSchema.index({ regionKey: 1, state: 1 });

export default models.DedicatedCapacityReservation || model("DedicatedCapacityReservation", DedicatedCapacityReservationSchema);
