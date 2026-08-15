import { z } from "zod";
import { GRAPHICS_APIS, PERFORMANCE_TIERS, REQUIREMENT_SOURCES } from "./types";

export const performanceTierSchema = z.enum(PERFORMANCE_TIERS);
export const graphicsApiSchema = z.enum(GRAPHICS_APIS);
export const requirementSourceSchema = z.enum(REQUIREMENT_SOURCES);

/**
 * A hardware figure, or none.
 *
 * Zero is allowed because these are requirements, and "0" is a real answer:
 * a browser game needs no disk. Requiring a positive number meant a game that
 * genuinely needs nothing could not be saved without inventing a 1MB
 * requirement — a small lie in a field the compatibility checker reads.
 *
 * Null is accepted and normalised away so that documents already storing null
 * for an unset figure do not fail validation on an unrelated edit.
 *
 * Falsy values are skipped by the compatibility checker, so 0 reads as "no
 * constraint" rather than "needs zero and therefore always passes".
 */
function optionalHardwareAmount(max: number) {
  // preprocess rather than transform: transform makes the output key required
  // (as `number | undefined`), which no longer matches the optional field on
  // RequirementSpec and breaks every consumer of the inferred type.
  return z.preprocess(
    (v) => (v === null || v === "" ? undefined : v),
    z.number().int().nonnegative().max(max).optional()
  );
}

export const requirementSpecSchema = z
  .object({
    os: z.array(z.enum(["windows", "macos", "linux"])).optional(),
    arch: z.array(z.enum(["x64", "arm64", "x86", "unknown"])).optional(),
    cpuTier: performanceTierSchema.optional(),
    cpuText: z.string().max(200).optional(),
    gpuTier: performanceTierSchema.optional(),
    gpuText: z.string().max(200).optional(),
    ramMB: optionalHardwareAmount(1_000_000),
    vramMB: optionalHardwareAmount(1_000_000),
    storageMB: optionalHardwareAmount(100_000_000),
    apis: z.array(graphicsApiSchema).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const requirementProvenanceSchema = z
  .object({
    source: requirementSourceSchema,
    sourceUrl: z.string().url().max(500).nullable().optional(),
    verifiedAt: z.string().max(40).nullable().optional(),
    enteredBy: z.string().max(80).nullable().optional(),
  })
  .strict();

export const hardwareRequirementsBlockSchema = z
  .object({
    min: requirementSpecSchema.optional(),
    recommended: requirementSpecSchema.optional(),
    target: z
      .object({
        resolution: z.string().max(40).optional(),
        fps: z.number().int().positive().max(1000).optional(),
        preset: z.string().max(40).optional(),
      })
      .strict()
      .optional(),
    provenance: requirementProvenanceSchema.optional(),
  })
  .strict();

export const modHardwareRequirementsSchema = z
  .object({
    additional: requirementSpecSchema.optional(),
    provenance: requirementProvenanceSchema.optional(),
  })
  .strict();

export const detectedGpuSchema = z.object({
  rawName: z.string().max(300),
  manufacturer: z.string().max(80).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
  vramMB: z.number().int().nonnegative().nullable().optional(),
  driverVersion: z.string().max(80).nullable().optional(),
  vendorId: z.string().max(40).nullable().optional(),
  deviceId: z.string().max(40).nullable().optional(),
  isIntegrated: z.boolean().nullable().optional(),
  isVirtual: z.boolean().nullable().optional(),
});

export const hardwareProfilePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  collectedAt: z.string().max(40),
  os: z.object({
    family: z.enum(["windows", "macos", "linux", "unknown"]),
    name: z.string().max(120).nullable().optional(),
    version: z.string().max(80).nullable().optional(),
    arch: z.enum(["x64", "arm64", "x86", "unknown"]),
    bitness: z.union([z.literal(32), z.literal(64), z.null()]).optional(),
  }),
  cpu: z.object({
    rawName: z.string().max(300),
    manufacturer: z.string().max(80).nullable().optional(),
    model: z.string().max(200).nullable().optional(),
    arch: z.string().max(40).nullable().optional(),
    cores: z.number().int().positive().nullable().optional(),
    threads: z.number().int().positive().nullable().optional(),
    baseFrequencyGHz: z.number().positive().nullable().optional(),
    features: z.array(z.string().max(40)).max(64).optional(),
  }),
  gpus: z.array(detectedGpuSchema).max(16),
  primaryGpuIndex: z.number().int().nonnegative().nullable(),
  primaryGpuConfidence: z.enum(["low", "medium", "high"]),
  memory: z.object({
    totalMB: z.number().int().nonnegative().nullable(),
    availableMB: z.number().int().nonnegative().nullable().optional(),
  }),
  storage: z
    .object({
      totalAvailableMB: z.number().int().nonnegative().nullable().optional(),
      installDrive: z
        .object({
          mount: z.string().max(20).nullable().optional(),
          freeMB: z.number().int().nonnegative().nullable().optional(),
          totalMB: z.number().int().nonnegative().nullable().optional(),
          type: z.enum(["ssd", "hdd", "nvme", "unknown"]).nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
  detectionErrors: z.array(z.string().max(200)).max(32).optional(),
});
