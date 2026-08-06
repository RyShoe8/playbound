import { Schema, model, models, type Types } from "mongoose";
import {
  PLATFORM_SESSION_STATUSES,
  PRESENCE_DEVICES,
  PRESENCE_OS,
  PRESENCE_PLATFORMS,
} from "@/lib/presence/types";

/**
 * One stretch of time a user had PlayBound open.
 *
 * NOT a game session. A game session is "played OpenRA for 40 minutes" and
 * lives in TelemetryEvent as analytics. This is "had the site or launcher open
 * for 40 minutes", which answers retention and engagement questions the
 * game-level events cannot.
 *
 * Unlike Presence this is append-only history: rows are created on start,
 * closed on end, and never reused.
 */
const PlatformSessionSchema = new Schema(
  {
    /** Client-generated UUID. Lets a client resume its own row after a blip. */
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    platform: { type: String, enum: PRESENCE_PLATFORMS, default: "web", index: true },
    /** Operating system, tracked separately from form factor. */
    os: { type: String, enum: PRESENCE_OS, default: "unknown" },
    device: { type: String, enum: PRESENCE_DEVICES, default: "desktop" },
    status: {
      type: String,
      enum: PLATFORM_SESSION_STATUSES,
      default: "active",
      index: true,
    },

    startedAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null },
    /**
     * Written on close. Denormalised rather than computed from the timestamps
     * so aggregations can sum a field instead of a per-document expression.
     */
    durationSeconds: { type: Number, default: null },
    lastHeartbeat: { type: Date, default: Date.now, index: true },

    /** Captured once at start; never updated. */
    referrer: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

/** The sweep: active sessions whose heartbeat has aged out. */
PlatformSessionSchema.index({ status: 1, lastHeartbeat: 1 });

/** "This user's sessions, newest first" — the shape every report wants. */
PlatformSessionSchema.index({ userId: 1, startedAt: -1 });

export type PlatformSessionDoc = {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  platform: string;
  device: string;
  os?: string;
  status: string;
  startedAt: Date;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  lastHeartbeat: Date;
  referrer?: string | null;
  userAgent?: string | null;
};

const PlatformSession =
  models.PlatformSession || model("PlatformSession", PlatformSessionSchema);
export default PlatformSession;
