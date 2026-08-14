import { Schema, model, models } from "mongoose";

/**
 * Records each ingestion job run for debugging and admin visibility.
 *
 * One document per provider per run. Kept indefinitely — they are small and
 * the history is useful for diagnosing intermittent API issues.
 */
const IngestionLogSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ["epic", "steam", "gog", "prime_gaming"],
      index: true,
    },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["success", "partial", "failed"],
      default: "failed",
    },
    offersFound: { type: Number, default: 0 },
    offersCreated: { type: Number, default: 0 },
    offersUpdated: { type: Number, default: 0 },
    offersExpired: { type: Number, default: 0 },
    gamesMatched: { type: Number, default: 0 },
    gamesCreated: { type: Number, default: 0 },
    gamesUnmatched: { type: Number, default: 0 },
    errorMessage: { type: String, default: null },
    errorStack: { type: String, default: null },
  },
  { timestamps: true }
);

// Recent-first per provider, for the admin dashboard.
IngestionLogSchema.index({ provider: 1, startedAt: -1 });

const IngestionLog = models.IngestionLog || model("IngestionLog", IngestionLogSchema);
export default IngestionLog;
