import {
  PERFORMANCE_TIERS,
  type PerformanceTier,
  type PerformanceTierOrUnknown,
} from "./types";

const RANK: Record<PerformanceTierOrUnknown, number> = {
  unknown: -1,
  entry: 0,
  low: 1,
  mid: 2,
  high: 3,
  enthusiast: 4,
};

export function isPerformanceTier(value: unknown): value is PerformanceTier {
  return typeof value === "string" && (PERFORMANCE_TIERS as readonly string[]).includes(value);
}

export function tierRank(tier: PerformanceTierOrUnknown | null | undefined): number {
  if (!tier) return RANK.unknown;
  return RANK[tier] ?? RANK.unknown;
}

/** True when user tier meets or exceeds required tier. Unknown never meets. */
export function tierMeets(
  user: PerformanceTierOrUnknown | null | undefined,
  required: PerformanceTier | null | undefined
): boolean | null {
  if (!required) return null;
  if (!user || user === "unknown") return null;
  return tierRank(user) >= tierRank(required);
}

export function maxTier(
  a?: PerformanceTier | null,
  b?: PerformanceTier | null
): PerformanceTier | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return tierRank(a) >= tierRank(b) ? a : b;
}

/**
 * Lightweight product-line heuristics for unknown SKUs.
 * Prefer curated HardwareCpu/Gpu rows; these are fallbacks only.
 */
export function inferGpuTierFromName(name: string): PerformanceTierOrUnknown {
  const n = name.toLowerCase();
  if (!n.trim()) return "unknown";
  if (/rtx\s*40[89]0|rx\s*7900|radeon\s*pro\s*w7/.test(n)) return "enthusiast";
  if (/rtx\s*40[67]0|rtx\s*30[89]0|rx\s*78|rx\s*6950|arc\s*a7/.test(n)) return "high";
  if (/rtx\s*30[56]0|rtx\s*2060|gtx\s*1660|rx\s*66|rx\s*5700|arc\s*a5/.test(n)) return "mid";
  if (/gtx\s*10[56]0|gtx\s*1650|rx\s*580|rx\s*5600|intel\s*iris\s*xe/.test(n)) return "low";
  if (/gt\s*|uhd\s*graphics|intel\s*hd|radeon\s*vega\s*[38]|mali|adreno/.test(n)) return "entry";
  if (/rtx|gtx|radeon|geforce|arc\s*a/.test(n)) return "mid";
  return "unknown";
}

export function inferCpuTierFromName(name: string): PerformanceTierOrUnknown {
  const n = name.toLowerCase();
  if (!n.trim()) return "unknown";
  if (/i9-|ryzen\s*9|threadripper|core\s*ultra\s*9/.test(n)) return "enthusiast";
  if (/i7-|ryzen\s*7|core\s*ultra\s*7/.test(n)) return "high";
  if (/i5-|ryzen\s*5|core\s*ultra\s*5/.test(n)) return "mid";
  if (/i3-|ryzen\s*3|pentium|celeron|athlon/.test(n)) return "low";
  if (/atom|n50|n10|a4-|a6-/.test(n)) return "entry";
  if (/intel|amd|ryzen|core/.test(n)) return "mid";
  return "unknown";
}
