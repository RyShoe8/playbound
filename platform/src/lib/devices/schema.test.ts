import { describe, it, expect } from "vitest";
import { registerDeviceSchema, trustDeviceSchema } from "./schema";
import Device from "@/lib/models/Device";

describe("registerDeviceSchema", () => {
  it("stores LAN endpoints on the device rather than on a trusted client", () => {
    expect(Device.schema.path("lanAddresses")).toBeDefined();
    expect(Device.schema.path("hostPort")).toBeDefined();
    expect(Device.schema.path("trustedDevices").schema.path("lanAddresses")).toBeUndefined();
  });
  it("accepts private LAN addresses and rejects public or malformed endpoints", () => {
    const base = { deviceId: "a".repeat(36), name: "Gaming PC", hostPort: 47998 };
    expect(registerDeviceSchema.safeParse({ ...base, lanAddresses: ["192.168.1.30", "10.0.0.4"] }).success).toBe(true);
    expect(registerDeviceSchema.safeParse({ ...base, lanAddresses: ["8.8.8.8"] }).success).toBe(false);
    expect(registerDeviceSchema.safeParse({ ...base, lanAddresses: ["192.168.1.999"] }).success).toBe(false);
  });
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
