export const RESOURCE_MEASUREMENT_VERSION = 2;
export const RESOURCE_WARMUP_MS = 5 * 60_000;
export const MIN_SETTLED_SAMPLES = 3;

/** Only settled, query-confirmed readings establish ongoing resource use. */
export function isSettledResourceReading(input: {
  phase: string; players: number | null; cpuCores: number; nodeCpuCores?: number;
  sampleIntervalMs?: number; scope?: string; runtimeAgeMs?: number;
}): boolean {
  return input.phase !== "startup" && input.players !== null && Number.isInteger(input.players) && input.players >= 0
    && Number.isFinite(input.cpuCores) && input.cpuCores >= 0
    && Number.isFinite(input.nodeCpuCores) && input.nodeCpuCores! > 0 && input.cpuCores <= input.nodeCpuCores!
    && input.scope === "process-group"
    && Number.isFinite(input.sampleIntervalMs) && input.sampleIntervalMs! >= 1000 && input.sampleIntervalMs! <= 60_000
    && Number.isFinite(input.runtimeAgeMs) && input.runtimeAgeMs! >= RESOURCE_WARMUP_MS;
}
