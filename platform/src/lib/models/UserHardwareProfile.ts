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

/**
 * Sentinel `deviceId` for a profile uploaded before PlayBound Remote existed
 * (or by a launcher build that doesn't send one yet) — keeps every existing
 * single-PC caller working unchanged rather than requiring every read/write
 * site to special-case "no deviceId".
 */
export const PRIMARY_DEVICE_ID = "primary";

const UserHardwareProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /**
     * One profile per physical PC, not per account — PlayBound Remote needs
     * to compare a game against "this laptop" vs "Ryan's gaming PC"
     * separately. `PRIMARY_DEVICE_ID` covers the pre-Remote single-PC case.
     *
     * NOTE: the unique index below is `{userId, deviceId}`, replacing the
     * old `userId`-alone unique index. That old index still physically
     * exists on production Mongo until
     * `scripts/migrate-hardware-profile-device-index.ts --apply` is run by
     * hand — see that script's docstring. Until then, a second device's
     * profile for the same user will still collide with the old index.
     */
    deviceId: { type: String, default: PRIMARY_DEVICE_ID },
    /** User-editable label — "Ryan's Gaming PC". Null for PRIMARY_DEVICE_ID until renamed. */
    deviceName: { type: String, default: null },
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

UserHardwareProfileSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const UserHardwareProfile =
  models.UserHardwareProfile || model("UserHardwareProfile", UserHardwareProfileSchema);
export default UserHardwareProfile;
