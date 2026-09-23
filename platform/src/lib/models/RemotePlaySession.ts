import { Schema, model, models } from "mongoose";

/**
 * One PlayBound Remote streaming session — modeled directly on
 * `MultiplayerSession`'s ephemeral, TTL+heartbeat shape (short-lived
 * coordination record, not permanent history). A player's actual "played
 * remotely, 1h 42m" history is a `TelemetryEvent`, the same as any other
 * session-length stat already tracked — this model exists only while the
 * stream is live or was very recently live, not as an archive.
 */

const RemotePlaySessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hostDeviceId: { type: String, required: true, index: true },
    clientDeviceId: { type: String, required: true, index: true },
    gameSlug: { type: String, required: true, index: true },
    editionSlug: { type: String, default: null },

    status: {
      type: String,
      enum: ["starting", "streaming", "ended"],
      default: "starting",
      index: true,
    },
    resolution: { type: String, default: "1920x1080" },
    fps: { type: Number, default: 60 },
    codec: { type: String, default: "h264" },

    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date, default: null },
    terminationReason: {
      type: String,
      enum: ["player_exit", "game_crashed", "host_offline", "network_error", "repaired", null],
      default: null,
    },

    averageLatencyMs: { type: Number, default: null },
    averageBitrateMbps: { type: Number, default: null },
    packetLossPct: { type: Number, default: null },

    lastHeartbeat: { type: Date, required: true, default: Date.now, index: true },
    // A session that never reaches "ended" (crashed host, killed process)
    // must still disappear — same TTL contract as MultiplayerSession/CouchSession.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

RemotePlaySessionSchema.index({ hostDeviceId: 1, status: 1 });

const RemotePlaySession = models.RemotePlaySession || model("RemotePlaySession", RemotePlaySessionSchema);
export default RemotePlaySession;
