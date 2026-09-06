import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Platform-wide limits an admin can change without a deploy.
 *
 * A singleton, the same shape as MirrorSettings: one document keyed by
 * `singletonKey`, unique so a second one cannot be created by accident.
 *
 * The free party pool is the number that matters here. It is a shared budget:
 * every party member not covered by a subscriber's own plan draws on it, so
 * how many are free depends on who else is playing. Raising it costs
 * infrastructure; lowering it does not evict anyone, because slots are claimed
 * at join and held until the member leaves.
 */
export interface IPlatformLimits extends Document {
  singletonKey: string;
  /** Concurrent party slots PlayBound funds for everyone, shared platform-wide. */
  freePartySlotPool: number;
  /** No party exceeds this, however much plan and pool capacity exists. */
  partyHardCap: number;
  /**
   * Slots a party gets when nothing else applies.
   *
   * Kept so the pool can be set to zero — for a maintenance window, or to make
   * subscriptions the only route — without parties collapsing to a single
   * member. Zero here genuinely means "subscribers only".
   */
  freePartyBaseline: number;
  /** Turns the pool off entirely, so only plan slots count. */
  poolEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformLimitsSchema = new Schema<IPlatformLimits>(
  {
    singletonKey: { type: String, required: true, unique: true, default: "default" },
    freePartySlotPool: { type: Number, required: true, default: 200, min: 0 },
    /*
     * 20 matches the clamp party creation already applies, so turning this on
     * changes nothing about existing behaviour until an admin moves it.
     */
    partyHardCap: { type: Number, required: true, default: 20, min: 2 },
    freePartyBaseline: { type: Number, required: true, default: 0, min: 0 },
    poolEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const PlatformLimits: Model<IPlatformLimits> =
  mongoose.models.PlatformLimits ||
  mongoose.model<IPlatformLimits>("PlatformLimits", PlatformLimitsSchema);

export default PlatformLimits;
