import { Schema, model, models } from "mongoose";
import { PERFORMANCE_TIERS } from "@/lib/hardware/types";

const HardwareGpuSchema = new Schema(
  {
    identityKey: { type: String, required: true, unique: true, index: true },
    manufacturer: { type: String, default: null },
    model: { type: String, required: true },
    displayName: { type: String, required: true },
    typicalVramMB: { type: Number, default: null },
    tier: {
      type: String,
      enum: [...PERFORMANCE_TIERS, "unknown"],
      default: "unknown",
      index: true,
    },
    apis: { type: [String], default: [] },
    aliases: { type: [String], default: [] },
    source: { type: String, enum: ["seed", "auto", "admin"], default: "auto" },
  },
  { timestamps: true }
);

const HardwareGpu = models.HardwareGpu || model("HardwareGpu", HardwareGpuSchema);
export default HardwareGpu;
