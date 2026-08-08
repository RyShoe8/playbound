import { Schema } from "mongoose";
import { PERFORMANCE_TIERS, REQUIREMENT_SOURCES, GRAPHICS_APIS } from "@/lib/hardware/types";

/** Reusable subdocument for additive structured hardware requirements. */
export const RequirementSpecSchema = new Schema(
  {
    os: { type: [String], default: undefined },
    arch: { type: [String], default: undefined },
    cpuTier: { type: String, enum: PERFORMANCE_TIERS, default: undefined },
    cpuText: { type: String, default: undefined },
    gpuTier: { type: String, enum: PERFORMANCE_TIERS, default: undefined },
    gpuText: { type: String, default: undefined },
    ramMB: { type: Number, default: undefined },
    vramMB: { type: Number, default: undefined },
    storageMB: { type: Number, default: undefined },
    apis: { type: [{ type: String, enum: GRAPHICS_APIS }], default: undefined },
    notes: { type: String, default: undefined },
  },
  { _id: false }
);

export const RequirementProvenanceSchema = new Schema(
  {
    source: { type: String, enum: REQUIREMENT_SOURCES, default: "unverified" },
    sourceUrl: { type: String, default: null },
    verifiedAt: { type: String, default: null },
    enteredBy: { type: String, default: null },
  },
  { _id: false }
);

export const HardwareRequirementsBlockSchema = new Schema(
  {
    min: { type: RequirementSpecSchema, default: undefined },
    recommended: { type: RequirementSpecSchema, default: undefined },
    target: {
      resolution: { type: String, default: undefined },
      fps: { type: Number, default: undefined },
      preset: { type: String, default: undefined },
    },
    provenance: { type: RequirementProvenanceSchema, default: undefined },
  },
  { _id: false }
);

export const ModHardwareRequirementsSchema = new Schema(
  {
    additional: { type: RequirementSpecSchema, default: undefined },
    provenance: { type: RequirementProvenanceSchema, default: undefined },
  },
  { _id: false }
);
