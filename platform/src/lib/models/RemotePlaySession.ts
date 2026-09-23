import { Schema, model, models } from "mongoose";

/**
 * The Remote Play request/handoff record — modeled on
 * `MultiplayerSession`'s ephemeral, TTL+heartbeat shape (short-lived
 * coordination record, not permanent history). A player's actual "played
 * remotely, 1h 42m" history is a `TelemetryEvent`, the same as any other
 * session-length stat already tracked — this model exists only while a
 * request is being handed off or a stream is live, not as an archive.
 *
 * This does NOT duplicate `CouchSession` — that still owns the actual WebRTC
 * signaling (offer/answer/ICE). This is just how the client device asks a
 * host device (both on the same account) to launch a game and hand back a
 * CouchSession join URL; see docs on `insert-catalog-wave` for the "don't
 * build a second system that does the same thing" lesson this mirrors.
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
      // requested: client asked, waiting for host to notice.
      // ready: host launched the game and created a CouchSession — joinUrl is set.
      // streaming: client has opened the game-view window (best-effort ack).
      // ended: game exited on the host, or the client disconnected.
      // declined: host was busy / user cancelled before "ready".
      enum: ["requested", "ready", "streaming", "ended", "declined"],
      default: "requested",
      index: true,
    },
    /** Set once the host creates the CouchSession — what the client opens via openCouchGameView. */
    joinUrl: { type: String, default: null },
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
