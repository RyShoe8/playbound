import { Schema, model, models } from "mongoose";

const CommunityServerProfileSchema = new Schema({
  key: { type: String, required: true, unique: true },
  gameSlug: { type: String, required: true, index: true },
  editionSlug: { type: String, default: null },
  mod: { type: String, default: null },
  enabled: { type: Boolean, default: false },
  rotationEligible: { type: Boolean, default: false },
  verification: { type: String, enum: ["unverified", "testing", "verified", "blocked"], default: "unverified" },
  blockedReason: { type: String, default: null },
  recipeSlug: { type: String, required: true },
  queryVerified: { type: Boolean, default: false },
  queryKind: { type: String, enum: ["openra-master", "none"], default: "none" },
  joinVerified: { type: Boolean, default: false },
  clientVersion: { type: String, default: null },
  serverVersion: { type: String, default: null },
  baselineVersion: { type: Number, default: 1, min: 1 },
  envelope: {
    cpuCores: { type: Number, default: 0, min: 0 },
    ramBytes: { type: Number, default: 0, min: 0 },
    measuredThroughPlayers: { type: Number, default: 0, min: 0 },
  },
  sampleCount: { type: Number, default: 0, min: 0 },
  lastSampleAt: { type: Date, default: null },
  lastVerifiedAt: { type: Date, default: null },
  weight: { type: Number, default: 1, min: 1, max: 100 },
  minimumOnlineMinutes: { type: Number, default: null, min: 0 },
  idleMinutes: { type: Number, default: null, min: 15 },
  cooldownMinutes: { type: Number, default: null, min: 0 },
}, { timestamps: true });

CommunityServerProfileSchema.index({ enabled: 1, verification: 1, rotationEligible: 1 });

export default models.CommunityServerProfile || model("CommunityServerProfile", CommunityServerProfileSchema);
