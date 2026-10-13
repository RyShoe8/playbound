import { Schema, model, models } from "mongoose";

/** Separate collection so a popular server cannot grow a profile document indefinitely. */
const ServerResourceSampleSchema = new Schema({
  profileKey: { type: String, required: true, index: true },
  communityServerId: { type: Schema.Types.ObjectId, ref: "CommunityServer", default: null },
  observedAt: { type: Date, required: true },
  players: { type: Number, default: null, min: 0 },
  cpuCores: { type: Number, required: true, min: 0 },
  ramBytes: { type: Number, required: true, min: 0 },
  nodeCpuPercent: { type: Number, default: null },
  nodeRamPercent: { type: Number, default: null },
  phase: { type: String, enum: ["startup", "idle", "occupied"], required: true },
  source: { type: String, enum: ["audit", "live"], required: true },
  sampleIntervalMs: { type: Number, default: null },
  processCount: { type: Number, default: null },
  scope: { type: String, default: null },
  runtimeAgeMs: { type: Number, default: null },
  nodeCpuCores: { type: Number, default: null },
  measurementVersion: { type: Number, default: 1 },
  baselineVersion: { type: Number, default: 1 },
  sampleKey: { type: String },
}, { timestamps: false });

ServerResourceSampleSchema.index({ profileKey: 1, observedAt: -1 });
ServerResourceSampleSchema.index({ sampleKey: 1 }, { unique: true, sparse: true });
ServerResourceSampleSchema.index({ observedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default models.ServerResourceSample || model("ServerResourceSample", ServerResourceSampleSchema);
