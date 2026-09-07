import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * The two numbers that govern free parties.
 *
 * A singleton, the same shape as MirrorSettings: one document keyed by
 * `singletonKey`, unique so a second cannot be created by accident.
 *
 * Deliberately just these two. Subscribers are bounded by the slots they buy
 * plus whatever the pool has spare, which needs no setting, and party size is
 * not something a player picks — a party is as big as the people in it.
 */
export interface IPlatformLimits extends Document {
  singletonKey: string;
  /**
   * Concurrent free party seats across the whole platform.
   *
   * A shared budget: every member a subscriber's own plan does not cover draws
   * on it, so how many are free depends on who is playing right now. Zero
   * turns free parties off entirely.
   */
  freePartySlotPool: number;
  /** The largest a party can get without a subscription. */
  maxFreePartySize: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformLimitsSchema = new Schema<IPlatformLimits>(
  {
    singletonKey: { type: String, required: true, unique: true, default: "default" },
    freePartySlotPool: { type: Number, required: true, default: 200, min: 0 },
    maxFreePartySize: { type: Number, required: true, default: 8, min: 2 },
  },
  { timestamps: true }
);

const PlatformLimits: Model<IPlatformLimits> =
  mongoose.models.PlatformLimits ||
  mongoose.model<IPlatformLimits>("PlatformLimits", PlatformLimitsSchema);

export default PlatformLimits;
