import type {
  GraphicsApi,
  HardwareRequirementsBlock,
  PerformanceTier,
  RequirementSpec,
} from "./types";

const SEP = /\s*[·•|;]\s*|\s{2,}/;

function toMB(amount: number, unit: string): number {
  const u = unit.toUpperCase();
  if (u === "GB") return Math.round(amount * 1024);
  if (u === "TB") return Math.round(amount * 1024 * 1024);
  return Math.round(amount);
}

function extractMemory(
  text: string,
  kind: "RAM" | "VRAM" | "STORAGE"
): number | undefined {
  if (kind === "RAM") {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)\s*RAM\b/i);
    if (m) return toMB(Number(m[1]), m[2]);
    return undefined;
  }
  if (kind === "VRAM") {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)\s*VRAM\b/i);
    if (m) return toMB(Number(m[1]), m[2]);
    return undefined;
  }
  const m = text.match(
    /(\d+(?:\.\d+)?)\s*(TB|GB|MB)(?:\s*\+)?\s*(?:storage|disk|hdd|ssd|free|assets)?\b/i
  );
  if (!m) return undefined;
  // Avoid treating "2 GB RAM" as storage when both appear; caller should strip RAM first.
  if (/\bRAM\b/i.test(m[0]) || /\bVRAM\b/i.test(m[0])) return undefined;
  return toMB(Number(m[1]), m[2]);
}

function extractApis(text: string): GraphicsApi[] {
  const apis = new Set<GraphicsApi>();
  const lower = text.toLowerCase();
  if (/\bdx\s*12\b|\bdirectx\s*12\b/.test(lower)) apis.add("dx12");
  else if (/\bdx\s*11\b|\bdirectx\s*11\b/.test(lower)) apis.add("dx11");
  else if (/\bdx\s*10\b|\bdirectx\s*10\b/.test(lower)) apis.add("dx10");
  else if (/\bdx\s*9\b|\bdirectx\s*9\b/.test(lower)) apis.add("dx9");
  if (/\bvulkan\b/.test(lower)) apis.add("vulkan");
  if (/\bmetal\b/.test(lower)) apis.add("metal");
  if (/\bopengl\b/.test(lower)) apis.add("opengl");
  return [...apis];
}

function inferGpuTier(text: string): PerformanceTier | undefined {
  const lower = text.toLowerCase();
  if (/\bintegrated\b|\blow[\s-]?end\b|\bbasic\b/.test(lower)) return "entry";
  if (/\bdedicated\b/.test(lower)) return "entry";
  return undefined;
}

function inferCpuTier(text: string): PerformanceTier | undefined {
  const lower = text.toLowerCase();
  if (/\blow[\s-]?end\b|\bminimal\b/.test(lower)) return "entry";
  return undefined;
}

function isVagueOnly(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    !t ||
    t === "any modern machine" ||
    t === "any modern pc" ||
    t === "n/a" ||
    t === "none" ||
    t === "—" ||
    t === "-"
  );
}

/**
 * Best-effort parse of a single free-text requirements line into a structured
 * RequirementSpec. Unknown / vague lines return null (do not invent).
 */
export function parseRequirementLine(text: string | null | undefined): RequirementSpec | null {
  if (!text || isVagueOnly(text)) return null;

  const clauses = text
    .split(SEP)
    .map((c) => c.trim())
    .filter(Boolean);

  const working = clauses.length ? clauses : [text.trim()];
  const spec: RequirementSpec = {};
  const notes: string[] = [];
  let cpuBits: string[] = [];
  let gpuBits: string[] = [];

  for (const clause of working) {
    const ram = extractMemory(clause, "RAM");
    if (ram != null) {
      spec.ramMB = Math.max(spec.ramMB ?? 0, ram);
      continue;
    }
    const vram = extractMemory(clause, "VRAM");
    if (vram != null) {
      spec.vramMB = Math.max(spec.vramMB ?? 0, vram);
      // Keep GPU wording when present (e.g. "1 GB VRAM GPU")
      if (/\bgpu\b/i.test(clause)) {
        gpuBits.push(clause.replace(/\s+/g, " ").trim());
      }
      continue;
    }

    const apis = extractApis(clause);
    if (apis.length) {
      spec.apis = [...new Set([...(spec.apis || []), ...apis])];
    }

    const storageish =
      /\b(storage|disk|hdd|ssd|free|assets)\b/i.test(clause) ||
      (/(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i.test(clause) &&
        !/\b(cpu|gpu|ram|vram|ghz|core)\b/i.test(clause));
    if (storageish) {
      const storage = extractMemory(clause, "STORAGE");
      if (storage != null) {
        spec.storageMB = Math.max(spec.storageMB ?? 0, storage);
        // Preserve non-numeric notes like "RCT2 data files" when bundled
        const leftover = clause
          .replace(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)(?:\s*\+)?\s*(?:storage|disk|hdd|ssd|free|assets)?/gi, "")
          .replace(/[·•|~]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (leftover && leftover.length > 2 && !/^\W+$/.test(leftover) && !/\bgpu\b|\bcpu\b/i.test(leftover)) {
          notes.push(leftover);
        }
        continue;
      }
    }

    if (/\bcpu\b|\bghz\b|\bcores?\b|\bdual-core\b|\bquad-core\b|\b\d+-core\b/i.test(clause)) {
      cpuBits.push(clause.replace(/\s+/g, " ").trim());
      continue;
    }

    if (
      /\bgpu\b|\bgtx\b|\brtx\b|\bradeon\b|\brx\s*\d|\bdedicated\b|\bintegrated\b|\bvulkan|\bopengl|\bdirectx|\bdx\d/i.test(
        clause
      )
    ) {
      gpuBits.push(clause.replace(/\s+/g, " ").trim());
      continue;
    }

    // Non-hardware prerequisites (game data files, accounts, etc.)
    if (!/^\d/.test(clause) && clause.length > 2) {
      notes.push(clause);
    }
  }

  // Fallbacks when separators were missing — scan whole string
  if (spec.ramMB == null) {
    const ram = extractMemory(text, "RAM");
    if (ram != null) spec.ramMB = ram;
  }
  if (spec.vramMB == null) {
    const vram = extractMemory(text, "VRAM");
    if (vram != null) spec.vramMB = vram;
  }
  if (spec.storageMB == null) {
    // Prefer explicit storage wording
    const storageMatch = text.match(
      /(\d+(?:\.\d+)?)\s*(TB|GB|MB)\s*(?:storage|disk|hdd|ssd|free)\b/i
    );
    if (storageMatch) {
      spec.storageMB = toMB(Number(storageMatch[1]), storageMatch[2]);
    }
  }
  if (!spec.apis?.length) {
    const apis = extractApis(text);
    if (apis.length) spec.apis = apis;
  }

  if (cpuBits.length) {
    spec.cpuText = cpuBits.join(" · ");
    const tier = inferCpuTier(spec.cpuText);
    if (tier) spec.cpuTier = tier;
  } else if (/\bcpu\b|\bghz\b/i.test(text)) {
    const m = text.match(/([^·•|;]*?(?:CPU|GHz)[^·•|;]*)/i);
    if (m) {
      spec.cpuText = m[1].replace(/\s+/g, " ").trim();
      const tier = inferCpuTier(spec.cpuText);
      if (tier) spec.cpuTier = tier;
    }
  }

  if (gpuBits.length) {
    spec.gpuText = gpuBits.join(" · ");
    const tier = inferGpuTier(spec.gpuText);
    if (tier) spec.gpuTier = tier;
  }

  if (notes.length) {
    spec.notes = notes.join(" · ");
  }

  const meaningful =
    spec.ramMB != null ||
    spec.vramMB != null ||
    spec.storageMB != null ||
    (spec.apis && spec.apis.length > 0) ||
    Boolean(spec.cpuText) ||
    Boolean(spec.gpuText) ||
    Boolean(spec.cpuTier) ||
    Boolean(spec.gpuTier);

  return meaningful ? spec : null;
}

/**
 * Parse free-text `{ min, recommended }` into a HardwareRequirementsBlock.
 * Returns null when nothing useful could be extracted.
 */
export function parseFreeTextRequirementsBlock(
  freeText: { min?: string; recommended?: string } | null | undefined
): HardwareRequirementsBlock | null {
  if (!freeText) return null;
  const min = parseRequirementLine(freeText.min);
  const recommended = parseRequirementLine(freeText.recommended);
  if (!min && !recommended) return null;
  return {
    ...(min ? { min } : {}),
    ...(recommended ? { recommended } : {}),
    provenance: {
      source: "unverified",
      enteredBy: "free-text-parser",
    },
  };
}

/** Attach parsed hardwareRequirements when missing and free-text is present. */
export function attachParsedHardwareRequirements<
  T extends {
    systemRequirements?: { min?: string; recommended?: string } | null;
    hardwareRequirements?: HardwareRequirementsBlock | null;
  },
>(items: T[]): T[] {
  return items.map((item) => {
    if (item.hardwareRequirements) return item;
    const parsed = parseFreeTextRequirementsBlock(item.systemRequirements ?? undefined);
    if (!parsed) return item;
    return { ...item, hardwareRequirements: parsed };
  });
}
