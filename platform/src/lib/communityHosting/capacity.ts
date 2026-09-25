export type ResourceEnvelope = { cpuCores: number; ramBytes: number };
export type CapacityReason = "NO_HEALTHY_NODE" | "STALE_METRICS" | "INSUFFICIENT_CAPACITY" | "REGION_UNAVAILABLE" | "PROFILE_NOT_VERIFIED";

export type PlacementInput = {
  now: Date;
  nodeEnabled: boolean;
  draining: boolean;
  requestedRegion: string;
  nodeRegion: string;
  profileVerified: boolean;
  metrics: {
    collectedAt: string;
    cpuCores: number;
    cpuUsagePercent: number | null;
    freeRamBytes: number;
    totalRamBytes: number;
  } | null;
  safety: { maxCpuPercent: number; maxRamPercent: number; minFreeRamBytes: number; maxMetricsAgeSeconds: number };
  budget: ResourceEnvelope;
  runningManaged: ResourceEnvelope[];
  plannedReservations: ResourceEnvelope[];
  requested: ResourceEnvelope;
};

export function placementDecision(input: PlacementInput): { allowed: true } | { allowed: false; reason: CapacityReason } {
  if (!input.profileVerified) return { allowed: false, reason: "PROFILE_NOT_VERIFIED" };
  if (input.requestedRegion !== input.nodeRegion) return { allowed: false, reason: "REGION_UNAVAILABLE" };
  if (!input.nodeEnabled || input.draining || !input.metrics) return { allowed: false, reason: "NO_HEALTHY_NODE" };
  const metrics = input.metrics;
  const age = input.now.getTime() - Date.parse(metrics.collectedAt);
  // Allow up to 60s of forward clock drift between distributed servers
  if (!Number.isFinite(age) || age < -60_000 || age > input.safety.maxMetricsAgeSeconds * 1000 || metrics.cpuUsagePercent === null) {
    return { allowed: false, reason: "STALE_METRICS" };
  }
  const envelopes = [...input.runningManaged, ...input.plannedReservations, input.requested];
  if (envelopes.some((e) => !Number.isFinite(e.cpuCores) || !Number.isFinite(e.ramBytes) || e.cpuCores <= 0 || e.ramBytes <= 0)) {
    return { allowed: false, reason: "INSUFFICIENT_CAPACITY" };
  }
  const requiredCpu = envelopes.reduce((sum, e) => sum + e.cpuCores, 0);
  const requiredRam = envelopes.reduce((sum, e) => sum + e.ramBytes, 0);
  if (requiredCpu > input.budget.cpuCores || requiredRam > input.budget.ramBytes) {
    return { allowed: false, reason: "INSUFFICIENT_CAPACITY" };
  }
  const newAndReserved = [...input.plannedReservations, input.requested];
  const addedCpu = newAndReserved.reduce((sum, e) => sum + e.cpuCores, 0);
  const addedRam = newAndReserved.reduce((sum, e) => sum + e.ramBytes, 0);
  const projectedCpuPercent = metrics.cpuUsagePercent + addedCpu / metrics.cpuCores * 100;
  const projectedRamPercent = (metrics.totalRamBytes - metrics.freeRamBytes + addedRam) / metrics.totalRamBytes * 100;
  if (!Number.isFinite(projectedCpuPercent) || !Number.isFinite(projectedRamPercent) || projectedCpuPercent > input.safety.maxCpuPercent || projectedRamPercent > input.safety.maxRamPercent || metrics.freeRamBytes - addedRam < input.safety.minFreeRamBytes) {
    return { allowed: false, reason: "INSUFFICIENT_CAPACITY" };
  }
  return { allowed: true };
}
