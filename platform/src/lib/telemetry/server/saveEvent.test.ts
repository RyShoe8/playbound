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
