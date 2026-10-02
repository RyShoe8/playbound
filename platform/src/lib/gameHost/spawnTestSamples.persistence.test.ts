import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  find: vi.fn(),
  updateOne: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: mocks.connect }));
vi.mock("@/lib/models/CatalogGame", () => ({ default: { find: mocks.find } }));
vi.mock("@/lib/models/CommunityServerProfile", () => ({ default: { updateOne: mocks.updateOne } }));
vi.mock("@/lib/communityHosting/samples", () => ({ recordResourceSample: mocks.record }));

import { recordSpawnTestSamples } from "./spawnTestSamples";

describe("persisting spawn-test readings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockReturnValue({ select: () => ({ lean: async () => [{ slug: "factorio" }] }) });
    mocks.updateOne.mockResolvedValue({ upsertedCount: 1 });
    mocks.record.mockResolvedValue(true);
  });

  it("creates only a disabled operational profile and records its idle sample", async () => {
    const count = await recordSpawnTestSamples({ ok: true, gameSlug: "factorio", resources: {
      rssBytes: 100_000_000, cpuCores: 0.4, sampleIntervalMs: 1500,
    } }, "factorio");
    expect(count).toBe(1);
    expect(mocks.updateOne).toHaveBeenCalledWith({ key: "factorio:base" }, {
      $setOnInsert: expect.objectContaining({
        gameSlug: "factorio", recipeSlug: "factorio", enabled: false,
        rotationEligible: false, verification: "testing", queryVerified: false, joinVerified: false,
      }),
    }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      profileKey: "factorio:base", players: 0, phase: "idle", source: "audit",
      cpuCores: 0.4, ramBytes: 100_000_000,
    }));
  });

  it("does not create a profile for a slug absent from the live catalog", async () => {
    mocks.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    expect(await recordSpawnTestSamples({ ok: true, gameSlug: "factorio", resources: {
      rssBytes: 100_000_000, cpuCores: 0.4,
    } }, "factorio")).toBe(0);
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
