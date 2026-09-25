import { describe, expect, it } from "vitest";
import { canScaleDownEmptyServer, placementDecision, runningReservationEnvelope, type PlacementInput } from "./capacity";

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
  it("reserves observed idle usage with headroom but keeps full budget for occupied or unknown servers", () => {
    const baseline = { cpuCores: 2, ramBytes: 3 * GIB };
    const observed = { available: true, cpuCores: 0.08, rssBytes: 800 * 1024 ** 2 };
    expect(runningReservationEnvelope({ baseline, players: 0, observed })).toEqual({ cpuCores: 0.5, ramBytes: 1200 * 1024 ** 2 });
    expect(runningReservationEnvelope({ baseline, players: null, observed })).toEqual(baseline);
    expect(runningReservationEnvelope({ baseline, players: 2, observed })).toEqual(baseline);
    expect(runningReservationEnvelope({ baseline, players: 0, observed: null })).toEqual(baseline);
  });
  it("never stops a server on an unknown or stale player count", () => {
    const now = base.now;
    expect(canScaleDownEmptyServer({ players: 0, checkedAt: now, protectedUntil: null }, now)).toBe(true);
    expect(canScaleDownEmptyServer({ players: null, checkedAt: now, protectedUntil: null }, now)).toBe(false);
    expect(canScaleDownEmptyServer({ players: 0, checkedAt: new Date(now.getTime() - 180_000), protectedUntil: null }, now)).toBe(false);
    expect(canScaleDownEmptyServer({ players: 0, checkedAt: now, protectedUntil: new Date(now.getTime() + 60_000) }, now)).toBe(false);
  });
  it("can place another game when the current fleet is confirmed idle", () => {
    const idle = [
      { baseline: { cpuCores: 2, ramBytes: 2.5 * GIB }, players: 0, observed: { available: true, cpuCores: 0.08, rssBytes: 770 * 1024 ** 2 } },
      { baseline: { cpuCores: 1, ramBytes: 1.5 * GIB }, players: 0, observed: { available: true, cpuCores: 0.04, rssBytes: 164 * 1024 ** 2 } },
      { baseline: { cpuCores: 1, ramBytes: 1.5 * GIB }, players: 0, observed: { available: true, cpuCores: 0.01, rssBytes: 35 * 1024 ** 2 } },
    ];
    expect(placementDecision({ ...base, budget: { cpuCores: 4, ramBytes: 6 * GIB }, runningManaged: idle.map(runningReservationEnvelope), requested: { cpuCores: 1, ramBytes: 1.5 * GIB } })).toEqual({ allowed: true });
  });
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
