import { beforeEach, describe, expect, it, vi } from "vitest";

const updateOne = vi.fn();
const create = vi.fn();

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/lib/models/TelemetryEvent", () => ({
  default: {
    updateOne: (...args: unknown[]) => updateOne(...args),
    create: (...args: unknown[]) => create(...args),
  },
}));
vi.mock("@/lib/autoBugReport", () => ({ maybeUpsertAutoBugFromTelemetry: vi.fn(async () => undefined) }));

describe("mod install telemetry receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateOne.mockResolvedValue({ acknowledged: true });
  });

  it("upserts one installation receipt and later attaches the linked account", async () => {
    const { saveEvent } = await import("./saveEvent");
    const properties = { modSlug: "sample-mod", installationId: "1bb3b216-69a8-448c-a64a-bccaa43ca6b1" };
    await saveEvent({ event: "mod_installed", properties, anonymousId: "anonymous" });
    await saveEvent({ event: "mod_installed", properties, userId: "user-1" });

    expect(create).not.toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledWith(
      { event: "mod_installed", "properties.installationId": properties.installationId },
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ event: "mod_installed" }) }),
      { upsert: true }
    );
    expect(updateOne).toHaveBeenCalledWith(
      { event: "mod_installed", "properties.installationId": properties.installationId },
      { $set: { userId: "user-1" } }
    );
  });

  it("keeps legacy mod install events without a receipt", async () => {
    const { saveEvent } = await import("./saveEvent");
    await saveEvent({ event: "mod_installed", properties: { modSlug: "legacy-mod" } });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("event time", () => {
  it("uses the server clock when the client clock is wrong", async () => {
    const { resolveEventTime } = await import("./saveEvent");
    const now = new Date("2026-10-10T12:00:00.000Z");
    expect(resolveEventTime(undefined, now).createdAt).toEqual(now);
    // Days in the past or hours in the future are skewed clocks, not real times.
    expect(resolveEventTime("2026-10-05T12:00:00.000Z", now)).toMatchObject({ createdAt: now, rejected: true });
    expect(resolveEventTime("2026-10-10T20:00:00.000Z", now)).toMatchObject({ createdAt: now, rejected: true });
    expect(resolveEventTime("not a date", now)).toMatchObject({ createdAt: now, rejected: true });
  });

  it("keeps a plausible client time for slightly delayed events", async () => {
    const { resolveEventTime } = await import("./saveEvent");
    const now = new Date("2026-10-10T12:00:00.000Z");
    const delayed = resolveEventTime("2026-10-10T11:58:00.000Z", now);
    expect(delayed.rejected).toBe(false);
    expect(delayed.createdAt.toISOString()).toBe("2026-10-10T11:58:00.000Z");
    // A stamp a minute ahead is clamped to receive time, never stored in the future.
    expect(resolveEventTime("2026-10-10T12:01:00.000Z", now).createdAt).toEqual(now);
  });
});

describe("ip truncation", () => {
  it("drops the host part of an address before storage", async () => {
    const { truncateIp } = await import("./saveEvent");
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0");
    expect(truncateIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3::");
    expect(truncateIp("2001:db8::1")).toBe("2001:db8::");
    expect(truncateIp("unknown")).toBeNull();
    expect(truncateIp(null)).toBeNull();
  });
});
