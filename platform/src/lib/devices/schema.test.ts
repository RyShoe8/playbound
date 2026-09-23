import { describe, it, expect } from "vitest";
import { registerDeviceSchema, trustDeviceSchema } from "./schema";

describe("registerDeviceSchema", () => {
  it("accepts a minimal valid device", () => {
    const result = registerDeviceSchema.safeParse({ deviceId: "a".repeat(36), name: "Ryan's Gaming PC" });
    expect(result.success).toBe(true);
  });

  it("rejects a deviceId that's too short to be a real generated id", () => {
    // Guards against a launcher bug that sends "" or a short placeholder —
    // that would let every under-configured install collide on one row.
    const result = registerDeviceSchema.safeParse({ deviceId: "short", name: "PC" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = registerDeviceSchema.safeParse({ deviceId: "a".repeat(36), name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts partial capabilities", () => {
    const result = registerDeviceSchema.safeParse({
      deviceId: "a".repeat(36),
      name: "PC",
      capabilities: { remotePlayHost: true },
    });
    expect(result.success).toBe(true);
  });
});

describe("trustDeviceSchema", () => {
  it("accepts a minimal valid trust request", () => {
    const result = trustDeviceSchema.safeParse({ deviceId: "b".repeat(36), name: "Living Room Laptop" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const result = trustDeviceSchema.safeParse({ deviceId: "b".repeat(36) });
    expect(result.success).toBe(false);
  });
});
