import { Schema, model, models, type Types } from "mongoose";
import {
  PRESENCE_DEVICES,
  PRESENCE_PLATFORMS,
  PRESENCE_STATUSES,
} from "@/lib/presence/types";

/**
 * A user's current state. One document per user, overwritten constantly.
 *
 * Deliberately has no history: this is the answer to "what is this person
 * doing right now", and nothing else. Historical questions are answered by
 * TelemetryEvent (game activity) and PlatformSession (time in PlayBound),
 * neither of which this touches.
 *
 * Anonymous visitors never get a row — presence is meaningless without an
 * identity to show it to.
 */
const PresenceSchema = new Schema(
  {
    // Unique: one row per user, upserted on every heartbeat.
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: PRESENCE_STATUSES,
      default: "online",
      index: true,
    },
    platform: { type: String, enum: PRESENCE_PLATFORMS, default: "web" },
    device: { type: String, enum: PRESENCE_DEVICES, default: "desktop" },

    /** Game/edition currently being viewed or played. Slugs, matching routing. */
    currentGameId: { type: String, default: null, index: true },
    currentEditionId: { type: String, default: null },
    /** Path only — no query string. See normalizePage(). */
    currentPage: { type: String, default: null },

    /** When this run of presence began (not when the account was created). */
    startedAt: { type: Date, default: Date.now },
    /**
     * Indexed because the staleness sweep queries exclusively on it: "everyone
     * marked online whose last beat is older than the cutoff".
     */
    lastHeartbeat: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

/**
 * The sweep's exact query shape — status plus heartbeat age. Compound so it
 * can run without touching documents that are already offline, which is most
 * of the collection once the platform has any real user count.
 */
PresenceSchema.index({ status: 1, lastHeartbeat: 1 });

/** Stage 2: "which of my friends are in this game right now". */
PresenceSchema.index({ currentGameId: 1, status: 1 });

export type PresenceDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  status: string;
  platform: string;
  device: string;
  currentGameId?: string | null;
  currentEditionId?: string | null;
  currentPage?: string | null;
  startedAt: Date;
  lastHeartbeat: Date;
  updatedAt: Date;
};

const Presence = models.Presence || model("Presence", PresenceSchema);
export default Presence;
