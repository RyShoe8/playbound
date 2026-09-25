import { describe, expect, it } from "vitest";
import { placementDecision, type PlacementInput } from "./capacity";

const GIB = 1024 ** 3;
const base: PlacementInput = {
  now: new Date("2026-09-24T12:00:00Z"), nodeEnabled: true, draining: false,
  requestedRegion: "us-central", nodeRegion: "us-central", profileVerified: true,
  metrics: { collectedAt: "2026-09-24T11:59:30Z", cpuCores: 8, cpuUsagePercent: 20, freeRamBytes: 12 * GIB, totalRamBytes: 16 * GIB },
  safety: { maxCpuPercent: 80, maxRamPercent: 85, minFreeRamBytes: 2 * GIB, maxMetricsAgeSeconds: 120 },
  budget: { cpuCores: 3, ramBytes: 6 * GIB }, runningManaged: [], plannedReservations: [],
  requested: { cpuCores: 1, ramBytes: GIB },
};

describe("community hosting placement", () => {
  it("allows measured capacity within the separate hosting budget", () => {
    expect(placementDecision(base)).toEqual({ allowed: true });
  });
  it("fails closed on stale or missing CPU measurements", () => {
    expect(placementDecision({ ...base, metrics: { ...base.metrics!, cpuUsagePercent: null } })).toEqual({ allowed: false, reason: "STALE_METRICS" });
  });
  it("accounts for running workloads and upcoming reservations once each", () => {
    expect(placementDecision({ ...base, runningManaged: [{ cpuCores: 1, ramBytes: 2 * GIB }], plannedReservations: [{ cpuCores: 1, ramBytes: 2 * GIB }] })).toEqual({ allowed: true });
    expect(placementDecision({ ...base, runningManaged: [{ cpuCores: 1.5, ramBytes: 2 * GIB }], plannedReservations: [{ cpuCores: 1, ramBytes: 2 * GIB }] })).toEqual({ allowed: false, reason: "INSUFFICIENT_CAPACITY" });
  });
  it("never places on a draining node or an unverified profile", () => {
    expect(placementDecision({ ...base, draining: true })).toEqual({ allowed: false, reason: "NO_HEALTHY_NODE" });
    expect(placementDecision({ ...base, profileVerified: false })).toEqual({ allowed: false, reason: "PROFILE_NOT_VERIFIED" });
  });
  it("places workloads with fallback baseline envelope when unmeasured", () => {
    // 1.0 core, 1.5GB RAM fallback baseline
    const fallbackEnvelope = { cpuCores: 1.0, ramBytes: 1536 * 1024 * 1024 };
    expect(placementDecision({ ...base, requested: fallbackEnvelope })).toEqual({ allowed: true });
  });
});

