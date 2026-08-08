import { maxTier } from "./tiers";
import type {
  GraphicsApi,
  HardwareRequirementsBlock,
  ModHardwareRequirements,
  OsFamily,
  ArchKind,
  RequirementSpec,
} from "./types";

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Merge requirement floors: higher tiers / larger numbers / union of OS constraints. */
export function mergeRequirementSpecs(
  base?: RequirementSpec | null,
  overlay?: RequirementSpec | null
): RequirementSpec | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return overlay ? { ...overlay } : undefined;
  if (!overlay) return { ...base };

  const os = uniq([...(base.os ?? []), ...(overlay.os ?? [])]) as OsFamily[];
  const arch = uniq([...(base.arch ?? []), ...(overlay.arch ?? [])]) as ArchKind[];
  const apis = uniq([...(base.apis ?? []), ...(overlay.apis ?? [])]) as GraphicsApi[];

  const ramMB =
    base.ramMB != null || overlay.ramMB != null
      ? Math.max(base.ramMB ?? 0, overlay.ramMB ?? 0) || undefined
      : undefined;
  const vramMB =
    base.vramMB != null || overlay.vramMB != null
      ? Math.max(base.vramMB ?? 0, overlay.vramMB ?? 0) || undefined
      : undefined;
  const storageMB =
    base.storageMB != null || overlay.storageMB != null
      ? Math.max(base.storageMB ?? 0, overlay.storageMB ?? 0) || undefined
      : undefined;

  const notes = [base.notes, overlay.notes].filter(Boolean).join(" · ") || undefined;

  return {
    os: os.length ? os : undefined,
    arch: arch.length ? arch : undefined,
    cpuTier: maxTier(base.cpuTier, overlay.cpuTier),
    cpuText: overlay.cpuText || base.cpuText,
    gpuTier: maxTier(base.gpuTier, overlay.gpuTier),
    gpuText: overlay.gpuText || base.gpuText,
    ramMB,
    vramMB,
    storageMB,
    apis: apis.length ? apis : undefined,
    notes,
  };
}

/**
 * Effective requirements for automation / compatibility:
 * Game + Edition (edition replaces missing fields and raises floors) + Mods (additive floors).
 */
export function effectiveHardwareRequirements(
  game?: HardwareRequirementsBlock | null,
  edition?: HardwareRequirementsBlock | null,
  mods?: ModHardwareRequirements[] | null
): HardwareRequirementsBlock {
  let min = mergeRequirementSpecs(game?.min, edition?.min);
  let recommended = mergeRequirementSpecs(game?.recommended, edition?.recommended);

  for (const mod of mods ?? []) {
    if (mod?.additional) {
      min = mergeRequirementSpecs(min, mod.additional);
      recommended = mergeRequirementSpecs(recommended, mod.additional);
    }
  }

  const target = edition?.target ?? game?.target;
  const provenance = edition?.provenance ?? game?.provenance;

  return {
    min,
    recommended,
    target: target ? { ...target } : undefined,
    provenance: provenance ? { ...provenance } : undefined,
  };
}

export function hasStructuredRequirements(block?: HardwareRequirementsBlock | null): boolean {
  if (!block) return false;
  const specs = [block.min, block.recommended];
  return specs.some((s) => {
    if (!s) return false;
    return Boolean(
      s.cpuTier ||
        s.gpuTier ||
        s.ramMB ||
        s.vramMB ||
        s.storageMB ||
        (s.os && s.os.length) ||
        (s.arch && s.arch.length) ||
        (s.apis && s.apis.length)
    );
  });
}
