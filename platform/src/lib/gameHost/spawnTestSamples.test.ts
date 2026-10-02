import { describe, expect, it } from "vitest";
import { idleSamplesFromSpawnTest, lastIdleTestReading } from "./spawnTestSamples";

const measured = { ok: true, resources: {
  rssBytes: 256 * 1024 * 1024, cpuCores: 0.12, sampleIntervalMs: 1500,
  processCount: 2, scope: "process-group",
} };

describe("spawn-test resource samples", () => {
  it("shows valid VPS idle readings without treating failed or incomplete tests as measurements", () => {
    expect(lastIdleTestReading({ ok: true, at: "2026-09-30T12:00:00Z", resources: {
      cpuCores: 0.12, rssBytes: 100_000_000,
    } })).toEqual({ cpuCores: 0.12, ramBytes: 100_000_000, at: "2026-09-30T12:00:00Z" });
    expect(lastIdleTestReading({ ok: false, at: "2026-09-30T12:00:00Z", resources: {
      cpuCores: 0.12, rssBytes: 100_000_000,
    } })).toBeNull();
    expect(lastIdleTestReading({ ok: true, at: "2026-09-30T12:00:00Z", resources: {
      cpuCores: null, rssBytes: 100_000_000,
    } })).toBeNull();
  });

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
