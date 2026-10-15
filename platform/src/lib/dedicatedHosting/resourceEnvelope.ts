import type { HostingTier } from "./tier";

export type DedicatedResourceEnvelope = { cpuCores: number; ramBytes: number; storageBytes: number };

/** Shared by inventory reservations and kernel-limit allocation. No DB writes. */
export function unitEnvelope(tier: HostingTier, slots: number): DedicatedResourceEnvelope {
  const units = Math.ceil(slots / tier.resourceClass.slotsPerUnit);
  return {
    cpuCores: units * tier.resourceClass.cpuPerUnit,
    ramBytes: units * tier.resourceClass.memoryMbPerUnit * 1024 ** 2,
    storageBytes: units * tier.resourceClass.storageGbPerUnit * 1024 ** 3,
  };
}
