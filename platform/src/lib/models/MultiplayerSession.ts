import { Schema, model, models } from "mongoose";

const MultiplayerSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    gameSlug: { type: String, required: true, index: true },
    joinCode: { type: String, required: true, unique: true },
    hostTokenHash: { type: String, required: true, select: false },
    clientTokenHashes: { type: [String], default: [], select: false },
    gameVersion: { type: String, required: true },
    modVersion: { type: String, default: null },
    packageHash: { type: String, default: null },
    maxPlayers: { type: Number, required: true, min: 1, max: 64 },
    playerCount: { type: Number, required: true, min: 0, max: 64 },
    status: {
      type: String,
      enum: ["waiting", "in_game", "ended"],
      default: "waiting",
      index: true,
    },
    lastHeartbeat: { type: Date, required: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    extraConfig: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const MultiplayerSession =
  models.MultiplayerSession ||
  model("MultiplayerSession", MultiplayerSessionSchema);

export default MultiplayerSession;
