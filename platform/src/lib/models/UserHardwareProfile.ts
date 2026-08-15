import { Schema, model, models } from "mongoose";

const GpuEntrySchema = new Schema(
  {
    rawName: { type: String, required: true },
    displayName: { type: String, default: null },
    manufacturer: { type: String, default: null },
    model: { type: String, default: null },
    vramMB: { type: Number, default: null },
    driverVersion: { type: String, default: null },
    isIntegrated: { type: Boolean, default: null },
    isVirtual: { type: Boolean, default: null },
    hardwareGpuId: { type: Schema.Types.ObjectId, ref: "HardwareGpu", default: null },
  },
  { _id: false }
);

const UserHardwareProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    schemaVersion: { type: Number, default: 1 },
    collectedAt: { type: Date, required: true },
    os: {
      family: { type: String, default: "unknown" },
      name: { type: String, default: null },
      version: { type: String, default: null },
      arch: { type: String, default: "unknown" },
      bitness: { type: Number, default: null },
    },
    cpu: {
      rawName: { type: String, default: "" },
      displayName: { type: String, default: null },
      manufacturer: { type: String, default: null },
      model: { type: String, default: null },
      cores: { type: Number, default: null },
      threads: { type: Number, default: null },
      baseFrequencyGHz: { type: Number, default: null },
      features: { type: [String], default: [] },
      hardwareCpuId: { type: Schema.Types.ObjectId, ref: "HardwareCpu", default: null },
      tier: { type: String, default: "unknown" },
    },
    gpus: { type: [GpuEntrySchema], default: [] },
    primaryGpuIndex: { type: Number, default: null },
    primaryGpuConfidence: { type: String, enum: ["low", "medium", "high"], default: "low" },
    memory: {
      totalMB: { type: Number, default: null },
      availableMB: { type: Number, default: null },
    },
    storage: {
      totalAvailableMB: { type: Number, default: null },
      installDrive: {
        mount: { type: String, default: null },
        freeMB: { type: Number, default: null },
        totalMB: { type: Number, default: null },
        type: { type: String, default: null },
      },
    },
    detectionErrors: { type: [String], default: [] },
    rawPayload: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const UserHardwareProfile =
  models.UserHardwareProfile || model("UserHardwareProfile", UserHardwareProfileSchema);
export default UserHardwareProfile;
