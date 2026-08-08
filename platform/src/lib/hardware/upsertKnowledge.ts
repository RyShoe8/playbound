import dbConnect from "@/lib/db";
import HardwareCpu from "@/lib/models/HardwareCpu";
import HardwareGpu from "@/lib/models/HardwareGpu";
import { normalizeCpuName, normalizeGpuName } from "./normalize";
import { inferCpuTierFromName, inferGpuTierFromName } from "./tiers";
import type { HardwareProfilePayload, PerformanceTierOrUnknown } from "./types";

export async function upsertCpuKnowledge(rawName: string, extras?: {
  cores?: number | null;
  threads?: number | null;
}) {
  await dbConnect();
  const n = normalizeCpuName(rawName);
  const inferred = inferCpuTierFromName(n.displayName);
  const existing = await HardwareCpu.findOne({ identityKey: n.identityKey });
  if (existing) {
    if (extras?.cores && !existing.cores) existing.cores = extras.cores;
    if (extras?.threads && !existing.threads) existing.threads = extras.threads;
    if (existing.tier === "unknown" && inferred !== "unknown") {
      existing.tier = inferred;
    }
    const alias = rawName.trim();
    if (alias && !existing.aliases.includes(alias)) {
      existing.aliases = [...existing.aliases, alias].slice(0, 40);
    }
    await existing.save();
    return existing;
  }
  return HardwareCpu.create({
    identityKey: n.identityKey,
    manufacturer: n.manufacturer,
    model: n.model || n.displayName,
    displayName: n.displayName,
    cores: extras?.cores ?? null,
    threads: extras?.threads ?? null,
    tier: inferred,
    aliases: rawName.trim() ? [rawName.trim()] : [],
    source: "auto",
  });
}

export async function upsertGpuKnowledge(rawName: string, extras?: {
  vramMB?: number | null;
}) {
  await dbConnect();
  const n = normalizeGpuName(rawName);
  const inferred = inferGpuTierFromName(n.displayName);
  const existing = await HardwareGpu.findOne({ identityKey: n.identityKey });
  if (existing) {
    if (extras?.vramMB && !existing.typicalVramMB) existing.typicalVramMB = extras.vramMB;
    if (existing.tier === "unknown" && inferred !== "unknown") {
      existing.tier = inferred;
    }
    const alias = rawName.trim();
    if (alias && !existing.aliases.includes(alias)) {
      existing.aliases = [...existing.aliases, alias].slice(0, 40);
    }
    await existing.save();
    return existing;
  }
  return HardwareGpu.create({
    identityKey: n.identityKey,
    manufacturer: n.manufacturer,
    model: n.model || n.displayName,
    displayName: n.displayName,
    typicalVramMB: extras?.vramMB ?? null,
    tier: inferred,
    aliases: rawName.trim() ? [rawName.trim()] : [],
    source: "auto",
  });
}

export type NormalizedProfileView = {
  cpuDisplay: string;
  cpuTier: PerformanceTierOrUnknown;
  gpuDisplay: string | null;
  gpuTier: PerformanceTierOrUnknown;
  vramMB: number | null;
  ramMB: number | null;
  osFamily: string;
  arch: string;
  cpuId: string | null;
  gpuIds: string[];
  primaryGpuIndex: number | null;
};

export async function normalizeAndLinkProfile(
  payload: HardwareProfilePayload
): Promise<NormalizedProfileView> {
  const cpuDoc = await upsertCpuKnowledge(payload.cpu.rawName, {
    cores: payload.cpu.cores,
    threads: payload.cpu.threads,
  });

  const gpuIds: string[] = [];
  for (const g of payload.gpus) {
    const doc = await upsertGpuKnowledge(g.rawName, { vramMB: g.vramMB });
    gpuIds.push(String(doc._id));
  }

  const idx =
    payload.primaryGpuIndex != null && payload.gpus[payload.primaryGpuIndex]
      ? payload.primaryGpuIndex
      : payload.gpus.length
        ? 0
        : null;
  const primaryGpu = idx != null ? payload.gpus[idx] : null;
  let gpuTier: PerformanceTierOrUnknown = "unknown";
  let gpuDisplay: string | null = null;
  let vramMB: number | null = null;
  if (primaryGpu) {
    const n = normalizeGpuName(primaryGpu.rawName);
    gpuDisplay = n.displayName;
    const gpuDoc = idx != null ? await HardwareGpu.findById(gpuIds[idx]) : null;
    gpuTier = (gpuDoc?.tier as PerformanceTierOrUnknown) || inferGpuTierFromName(n.displayName);
    vramMB = primaryGpu.vramMB ?? gpuDoc?.typicalVramMB ?? null;
  }

  const cpuN = normalizeCpuName(payload.cpu.rawName);

  return {
    cpuDisplay: cpuN.displayName,
    cpuTier: (cpuDoc.tier as PerformanceTierOrUnknown) || "unknown",
    gpuDisplay,
    gpuTier,
    vramMB,
    ramMB: payload.memory.totalMB,
    osFamily: payload.os.family,
    arch: payload.os.arch,
    cpuId: String(cpuDoc._id),
    gpuIds,
    primaryGpuIndex: idx,
  };
}
