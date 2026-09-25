import { Schema, model, models } from "mongoose";

const CommunityServerSchema = new Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  gameSlug: { type: String, required: true, index: true },
  editionSlug: { type: String, default: null },
  mod: { type: String, default: null },
  regionKey: { type: String, required: true },
  profileKey: { type: String, required: true },
  settings: { type: Schema.Types.Mixed, default: {} },
  desiredState: { type: String, enum: ["running", "stopped"], default: "stopped" },
  manualPause: { type: Boolean, default: false },
  runtimeState: { type: String, enum: ["stopped", "pending", "running", "failed", "unknown"], default: "stopped" },
  health: { type: String, enum: ["unknown", "healthy", "unhealthy"], default: "unknown" },
  runtimeId: { type: String, default: null },
  host: { type: String, default: null },
  port: { type: Number, default: null },
  playerCount: { type: Number, default: null, min: 0 },
  maxPlayerCount: { type: Number, default: null, min: 0 },
  bots: { type: Number, default: null, min: 0 },
  playerCountCheckedAt: { type: Date, default: null },
  lastOccupiedAt: { type: Date, default: null },
  onlineSince: { type: Date, default: null },
  cooldownUntil: { type: Date, default: null },
  linkedEventId: { type: Schema.Types.ObjectId, ref: "PlatformEvent", default: null },
  protectedUntil: { type: Date, default: null },
  decisionReason: { type: String, default: null },
  operationKey: { type: String, default: null },
  recoveryAttempts: { type: Number, default: 0, min: 0 },
  nextRecoveryAt: { type: Date, default: null },
  lastReconciledAt: { type: Date, default: null },
}, { timestamps: true });

CommunityServerSchema.index({ gameSlug: 1, editionSlug: 1, regionKey: 1 });
CommunityServerSchema.index({ desiredState: 1, runtimeState: 1 });

export default models.CommunityServer || model("CommunityServer", CommunityServerSchema);
