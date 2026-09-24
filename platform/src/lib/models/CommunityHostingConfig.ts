import { Schema, model, models } from "mongoose";

/** Operational configuration, independent of curated CatalogGame content. */
const CommunityHostingConfigSchema = new Schema({
  key: { type: String, required: true, unique: true, default: "global" },
  enabled: { type: Boolean, default: false },
  node: {
    key: { type: String, default: "vps-primary" },
    regionKey: { type: String, default: "us-central" },
    regionLabel: { type: String, default: "US Central" },
    enabled: { type: Boolean, default: false },
    draining: { type: Boolean, default: false },
  },
  safety: {
    maxCpuPercent: { type: Number, default: 80, min: 1, max: 95 },
    maxRamPercent: { type: Number, default: 85, min: 1, max: 95 },
    minFreeRamBytes: { type: Number, default: 2 * 1024 ** 3, min: 0 },
    maxMetricsAgeSeconds: { type: Number, default: 120, min: 30, max: 900 },
  },
  budget: {
    cpuCores: { type: Number, default: 1, min: 0 },
    ramBytes: { type: Number, default: 1024 ** 3, min: 0 },
  },
  monitoring: {
    cpuWarningPercent: { type: Number, default: 65, min: 0, max: 100 },
    cpuCriticalPercent: { type: Number, default: 80, min: 0, max: 100 },
    ramWarningPercent: { type: Number, default: 70, min: 0, max: 100 },
    ramCriticalPercent: { type: Number, default: 85, min: 0, max: 100 },
    diskWarningPercent: { type: Number, default: 75, min: 0, max: 100 },
    diskCriticalPercent: { type: Number, default: 90, min: 0, max: 100 },
  },
  rotation: {
    minimumOnlineMinutes: { type: Number, default: 120, min: 0 },
    idleMinutes: { type: Number, default: 60, min: 15 },
    cooldownMinutes: { type: Number, default: 60, min: 0 },
  },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

export default models.CommunityHostingConfig || model("CommunityHostingConfig", CommunityHostingConfigSchema);
