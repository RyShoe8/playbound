import mongoose, { Schema, Document, Model } from "mongoose";
import { PARTY_STRUCTURAL_MAX } from "@/lib/playTogether/types";

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
  /**
   * How large a party can get without paying.
   *
   * A business limit, not a safety rail: it binds parties whose host has no
   * plan slots and nobody else. A subscriber is bound by what they bought plus
   * whatever the pool has spare, and by maxPartySize below.
   */
  freePartyHardCap: number;
  /**
   * Slots a party gets when nothing else applies.
   *
   * Kept so the pool can be set to zero — for a maintenance window, or to make
   * subscriptions the only route — without parties collapsing to a single
   * member. Zero here genuinely means "subscribers only".
   */
  freePartyBaseline: number;
  /**
   * The largest any party may be, subscribers included.
   *
   * Editable here rather than compiled in, so a package selling more seats
   * does not need a deploy. Bounded only by PARTY_STRUCTURAL_MAX, which is a
   * runaway guard on the document rather than a business limit.
   */
  maxPartySize: number;
  /** Size a new party gets when its creator does not choose one. */
  defaultPartySize: number;
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
     * 20 was the old ceiling for everyone, so free parties keep exactly the
     * size they had. Subscribers are no longer bound by it.
     */
    freePartyHardCap: { type: Number, required: true, default: 20, min: 2 },
    maxPartySize: { type: Number, required: true, default: 100, min: 2, max: PARTY_STRUCTURAL_MAX },
    defaultPartySize: { type: Number, required: true, default: 8, min: 2 },
    freePartyBaseline: { type: Number, required: true, default: 0, min: 0 },
    poolEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const PlatformLimits: Model<IPlatformLimits> =
  mongoose.models.PlatformLimits ||
  mongoose.model<IPlatformLimits>("PlatformLimits", PlatformLimitsSchema);

export default PlatformLimits;
