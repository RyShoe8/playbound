import { describe, expect, it } from "vitest";
import { isSettledResourceReading } from "./resourceMeasurement";
const good = { phase: "idle", players: 0, cpuCores: 0.02, nodeCpuCores: 6, sampleIntervalMs: 10_000, scope: "process-group", runtimeAgeMs: 600_000 };
describe("settled resource measurements", () => {
  it("accepts idle and occupied readings after warmup", () => {
    expect(isSettledResourceReading(good)).toBe(true);
    expect(isSettledResourceReading({ ...good, phase: "occupied", players: 4 })).toBe(true);
  });
  it("rejects startup, unknown population, long averages, and physically impossible CPU", () => {
    for (const change of [{ phase: "startup" }, { players: null }, { runtimeAgeMs: 299_999 },
      { runtimeAgeMs: undefined }, { sampleIntervalMs: 900_000 }, { sampleIntervalMs: 999 },
      { cpuCores: 11.18 }, { nodeCpuCores: undefined }, { scope: undefined }]) {
      expect(isSettledResourceReading({ ...good, ...change })).toBe(false);
    }
  });
});
