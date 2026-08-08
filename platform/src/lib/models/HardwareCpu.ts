import { Schema, model, models } from "mongoose";
import { PERFORMANCE_TIERS } from "@/lib/hardware/types";

const HardwareCpuSchema = new Schema(
  {
    identityKey: { type: String, required: true, unique: true, index: true },
    manufacturer: { type: String, default: null },
    model: { type: String, required: true },
    displayName: { type: String, required: true },
    family: { type: String, default: null },
    cores: { type: Number, default: null },
    threads: { type: Number, default: null },
    tier: {
      type: String,
      enum: [...PERFORMANCE_TIERS, "unknown"],
      default: "unknown",
      index: true,
    },
    aliases: { type: [String], default: [] },
    source: { type: String, enum: ["seed", "auto", "admin"], default: "auto" },
  },
  { timestamps: true }
);

const HardwareCpu = models.HardwareCpu || model("HardwareCpu", HardwareCpuSchema);
export default HardwareCpu;
