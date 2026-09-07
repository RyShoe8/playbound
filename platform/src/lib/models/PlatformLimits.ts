import mongoose, { Schema, Document, Model } from "mongoose";
import { PARTY_ABSOLUTE_MAX } from "@/lib/playTogether/types";

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
   * whatever the pool has spare, and by PARTY_ABSOLUTE_MAX, which is a fact
   * about the schema rather than a setting.
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
     * Defaults to the schema ceiling, so switching this on changes nothing for
     * anyone until an admin lowers it — at which point it starts biting free
     * parties only.
     */
    freePartyHardCap: { type: Number, required: true, default: PARTY_ABSOLUTE_MAX, min: 2 },
    freePartyBaseline: { type: Number, required: true, default: 0, min: 0 },
    poolEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const PlatformLimits: Model<IPlatformLimits> =
  mongoose.models.PlatformLimits ||
  mongoose.model<IPlatformLimits>("PlatformLimits", PlatformLimitsSchema);

export default PlatformLimits;
