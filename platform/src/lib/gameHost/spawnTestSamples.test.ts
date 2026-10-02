import { describe, expect, it } from "vitest";
import { idleSamplesFromSpawnTest } from "./spawnTestSamples";

const measured = { ok: true, resources: {
  rssBytes: 256 * 1024 * 1024, cpuCores: 0.12, sampleIntervalMs: 1500,
  processCount: 2, scope: "process-group",
} };

describe("spawn-test resource samples", () => {
  it("records only a successful single base-game test for the requested slug", () => {
    expect(idleSamplesFromSpawnTest({ ...measured, gameSlug: "factorio" }, "factorio"))
      .toMatchObject([{ profileKey: "factorio:base", ramBytes: measured.resources.rssBytes,
        cpuCores: 0.12, players: 0, phase: "idle", source: "audit",
        sampleIntervalMs: 1500, processCount: 2, scope: "process-group" }]);
    expect(idleSamplesFromSpawnTest({ ...measured, gameSlug: "factorio" }, "barotrauma")).toEqual([]);
  });

  it("ignores failures, skipped games, aliases, and missing process measurements in a batch", () => {
    const samples = idleSamplesFromSpawnTest({ ok: true, results: {
      factorio: measured,
      barotrauma: { ok: false, resources: measured.resources },
      necesse: { ...measured, skipped: true },
      openarena: { ok: true, resources: { rssBytes: 0, cpuCores: 0 } },
      "counter-strike-2": { ok: true, resources: { rssBytes: 1024, cpuCores: 0 } },
    } });
    expect(samples.map((sample) => sample.profileKey)).toEqual(["factorio:base", "counter-strike-2:base"]);
    expect(idleSamplesFromSpawnTest({ ok: false, results: { factorio: measured } })).toEqual([]);
  });
});
