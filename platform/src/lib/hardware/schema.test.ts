import { describe, it, expect } from "vitest";
import { hardwareProfilePayloadSchema } from "./schema";

/**
 * Only the `deviceId`/`deviceName` addition for PlayBound Remote — the rest
 * of this large payload schema has no prior coverage and is out of scope
 * here. The property that matters: an older launcher build that has never
 * heard of devices must still validate exactly as it always has.
 */

function basePayload() {
  return {
    schemaVersion: 1 as const,
    collectedAt: new Date().toISOString(),
    os: { family: "windows" as const, arch: "x64" as const },
    cpu: { rawName: "Intel Core i7" },
    gpus: [],
    primaryGpuIndex: null,
    primaryGpuConfidence: "low" as const,
    memory: { totalMB: 16384 },
  };
}

describe("hardwareProfilePayloadSchema — deviceId/deviceName", () => {
  it("validates with neither field present, same as before Remote existed", () => {
    const result = hardwareProfilePayloadSchema.safeParse(basePayload());
    expect(result.success).toBe(true);
  });

  it("accepts a valid deviceId and deviceName", () => {
    const result = hardwareProfilePayloadSchema.safeParse({
      ...basePayload(),
      deviceId: "a".repeat(36),
      deviceName: "Ryan's Gaming PC",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a null deviceName (unnamed device)", () => {
    const result = hardwareProfilePayloadSchema.safeParse({
      ...basePayload(),
      deviceId: "a".repeat(36),
      deviceName: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty-string deviceId rather than silently treating it as absent", () => {
    const result = hardwareProfilePayloadSchema.safeParse({ ...basePayload(), deviceId: "" });
    expect(result.success).toBe(false);
  });
});
