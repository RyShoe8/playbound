import { hasStructuredRequirements } from "./mergeRequirements";
import { tierMeets, tierRank } from "./tiers";
import type {
  CompatibilityReason,
  CompatibilityResult,
  CompatibilityVerdict,
  HardwareRequirementsBlock,
  PerformanceTierOrUnknown,
  RequirementSpec,
} from "./types";

export type UserHardwareForCompat = {
  osFamily?: string | null;
  arch?: string | null;
  cpuDisplay?: string | null;
  cpuTier?: PerformanceTierOrUnknown | null;
  gpuDisplay?: string | null;
  gpuTier?: PerformanceTierOrUnknown | null;
  vramMB?: number | null;
  ramMB?: number | null;
  apis?: string[] | null;
};

function reason(
  code: string,
  severity: CompatibilityReason["severity"],
  message: string
): CompatibilityReason {
  return { code, severity, message };
}

function meetsNumber(user: number | null | undefined, required: number | null | undefined): boolean | null {
  if (required == null) return null;
  if (user == null) return null;
  return user >= required;
}

function evaluateSpec(
  user: UserHardwareForCompat,
  spec: RequirementSpec,
  label: "minimum" | "recommended"
): { ok: boolean; hardFail: boolean; unknown: boolean; reasons: CompatibilityReason[] } {
  const reasons: CompatibilityReason[] = [];
  let hardFail = false;
  let unknown = false;
  let failures = 0;
  let checks = 0;

  if (spec.os?.length) {
    checks += 1;
    const fam = (user.osFamily || "").toLowerCase();
    if (!fam || fam === "unknown") {
      unknown = true;
      reasons.push(reason("os_unknown", "warn", `PlayBound doesn’t know your OS to check ${label} OS support.`));
    } else if (!spec.os.includes(fam as never)) {
      hardFail = true;
      failures += 1;
      reasons.push(
        reason(
          "os_unsupported",
          "error",
          `This game’s ${label} requirements list ${spec.os.join("/")}, but your PC reports ${fam}.`
        )
      );
    }
  }

  if (spec.arch?.length) {
    checks += 1;
    const arch = (user.arch || "").toLowerCase();
    if (!arch || arch === "unknown") {
      unknown = true;
    } else if (!spec.arch.includes(arch as never)) {
      hardFail = true;
      failures += 1;
      reasons.push(
        reason(
          "arch_unsupported",
          "error",
          `Requires ${spec.arch.join("/")} architecture; your PC reports ${arch}.`
        )
      );
    }
  }

  if (spec.cpuTier) {
    checks += 1;
    const m = tierMeets(user.cpuTier, spec.cpuTier);
    if (m === null) {
      unknown = true;
      reasons.push(
        reason("cpu_unknown", "warn", `CPU tier unknown; can’t verify the ${label} CPU requirement.`)
      );
    } else if (!m) {
      failures += 1;
      reasons.push(
        reason(
          "cpu_below",
          "warn",
          `Your CPU (${user.cpuDisplay || "unknown"}) is below the ${label} CPU tier (${spec.cpuTier}${spec.cpuText ? `: ${spec.cpuText}` : ""}).`
        )
      );
    } else {
      reasons.push(
        reason(
          "cpu_ok",
          "info",
          `Your CPU meets the ${label} requirement${spec.cpuText ? ` (${spec.cpuText})` : ""}.`
        )
      );
    }
  }

  if (spec.gpuTier) {
    checks += 1;
    const m = tierMeets(user.gpuTier, spec.gpuTier);
    if (m === null) {
      unknown = true;
      reasons.push(
        reason("gpu_unknown", "warn", `GPU tier unknown; can’t verify the ${label} GPU requirement.`)
      );
    } else if (!m) {
      failures += 1;
      reasons.push(
        reason(
          "gpu_below",
          "warn",
          `Your GPU (${user.gpuDisplay || "unknown"}) is below the ${label} GPU tier (${spec.gpuTier}${spec.gpuText ? `: ${spec.gpuText}` : ""}).`
        )
      );
    } else {
      reasons.push(
        reason(
          "gpu_ok",
          "info",
          `Your GPU meets the ${label} requirement${spec.gpuText ? ` (${spec.gpuText})` : ""}.`
        )
      );
    }
  }

  if (spec.ramMB) {
    checks += 1;
    const m = meetsNumber(user.ramMB, spec.ramMB);
    if (m === null) {
      unknown = true;
    } else if (!m) {
      failures += 1;
      reasons.push(
        reason(
          "ram_below",
          "warn",
          `Your system has ${user.ramMB ?? "?"} MB RAM; ${label} asks for ${spec.ramMB} MB.`
        )
      );
    } else {
      reasons.push(
        reason("ram_ok", "info", `Your ${user.ramMB} MB RAM meets the ${label} ${spec.ramMB} MB requirement.`)
      );
    }
  }

  if (spec.vramMB) {
    checks += 1;
    const m = meetsNumber(user.vramMB, spec.vramMB);
    if (m === null) {
      unknown = true;
    } else if (!m) {
      failures += 1;
      reasons.push(
        reason(
          "vram_below",
          "warn",
          `Your GPU has ${user.vramMB ?? "?"} MB VRAM; ${label} asks for ${spec.vramMB} MB.`
        )
      );
    }
  }

  if (spec.apis?.length) {
    checks += 1;
    const userApis = new Set((user.apis || []).map((a) => a.toLowerCase()));
    if (!userApis.size) {
      // API support often unknown — soft unknown unless we have data
      unknown = true;
    } else {
      const missing = spec.apis.filter((a) => !userApis.has(a.toLowerCase()));
      if (missing.length) {
        hardFail = true;
        failures += 1;
        reasons.push(
          reason("api_unsupported", "error", `Missing required graphics API: ${missing.join(", ")}.`)
        );
      }
    }
  }

  const ok = checks > 0 && failures === 0 && !hardFail;
  return { ok, hardFail, unknown, reasons };
}

function pickSummary(verdict: CompatibilityVerdict, reasons: CompatibilityReason[]): string {
  const primary =
    reasons.find((r) => r.severity === "error") ||
    reasons.find((r) => r.severity === "warn") ||
    reasons.find((r) => r.severity === "info");
  if (primary) return primary.message;
  switch (verdict) {
    case "excellent":
      return "Your PC substantially exceeds the recommended requirements.";
    case "good":
      return "Your PC meets or exceeds the recommended requirements.";
    case "playable":
      return "Your PC meets the minimum requirements. You may need reduced settings.";
    case "limited":
      return "Your PC is near or below the minimum requirements.";
    case "unsupported":
      return "This game has a known incompatibility with your PC.";
    default:
      return "PlayBound doesn’t have enough reliable information to judge compatibility yet.";
  }
}

/**
 * Conservative tier-based compatibility. Never fabricates confidence when data is missing.
 */
export function evaluateCompatibility(
  user: UserHardwareForCompat | null | undefined,
  requirements: HardwareRequirementsBlock | null | undefined
): CompatibilityResult {
  const compared = {
    user: {
      cpu: user?.cpuDisplay ?? null,
      cpuTier: user?.cpuTier ?? null,
      gpu: user?.gpuDisplay ?? null,
      gpuTier: user?.gpuTier ?? null,
      ramMB: user?.ramMB ?? null,
      os: user?.osFamily ?? null,
    },
    required: {
      min: requirements?.min ?? null,
      recommended: requirements?.recommended ?? null,
      target: requirements?.target ?? null,
    },
  };

  if (!user) {
    return {
      verdict: "unknown",
      reasons: [reason("no_profile", "info", "Connect the PlayBound launcher to check this game on your PC.")],
      summary: "Connect the PlayBound launcher to check this game on your PC.",
      compared,
    };
  }

  if (!hasStructuredRequirements(requirements)) {
    return {
      verdict: "unknown",
      reasons: [
        reason(
          "no_requirements",
          "info",
          "PlayBound doesn’t have structured requirements for this title yet."
        ),
      ],
      summary: "PlayBound doesn’t have structured requirements for this title yet.",
      compared,
    };
  }

  const min = requirements!.min;
  const rec = requirements!.recommended;
  const allReasons: CompatibilityReason[] = [];

  const minEval = min ? evaluateSpec(user, min, "minimum") : null;
  const recEval = rec ? evaluateSpec(user, rec, "recommended") : null;
  if (minEval) allReasons.push(...minEval.reasons);
  if (recEval) allReasons.push(...recEval.reasons);

  if (minEval?.hardFail || recEval?.hardFail) {
    const verdict: CompatibilityVerdict = "unsupported";
    return {
      verdict,
      reasons: allReasons,
      summary: pickSummary(verdict, allReasons),
      compared,
    };
  }

  // Prefer recommended path when present
  if (rec && recEval) {
    if (recEval.ok) {
      const cpuBoost =
        rec.cpuTier && user.cpuTier && user.cpuTier !== "unknown"
          ? tierRank(user.cpuTier) >= tierRank(rec.cpuTier) + 1
          : false;
      const gpuBoost =
        rec.gpuTier && user.gpuTier && user.gpuTier !== "unknown"
          ? tierRank(user.gpuTier) >= tierRank(rec.gpuTier) + 1
          : false;
      const ramBoost = rec.ramMB && user.ramMB != null ? user.ramMB >= rec.ramMB * 1.5 : false;
      const excellent = (gpuBoost || cpuBoost) && (ramBoost || !rec.ramMB);
      const verdict: CompatibilityVerdict = excellent ? "excellent" : "good";
      if (excellent) {
        allReasons.unshift(
          reason(
            "exceeds_recommended",
            "info",
            "Your hardware is significantly above the recommended requirements."
          )
        );
      }
      return { verdict, reasons: allReasons, summary: pickSummary(verdict, allReasons), compared };
    }
  }

  if (min && minEval) {
    if (minEval.ok) {
      const verdict: CompatibilityVerdict = "playable";
      return { verdict, reasons: allReasons, summary: pickSummary(verdict, allReasons), compared };
    }
    // Failed min
    if (minEval.unknown && !minEval.reasons.some((r) => r.code.endsWith("_below"))) {
      return {
        verdict: "unknown",
        reasons: allReasons,
        summary: pickSummary("unknown", allReasons),
        compared,
      };
    }
    return {
      verdict: "limited",
      reasons: allReasons,
      summary: pickSummary("limited", allReasons),
      compared,
    };
  }

  // Only recommended existed and failed
  if (rec && recEval && !recEval.ok) {
    if (recEval.unknown) {
      return {
        verdict: "unknown",
        reasons: allReasons,
        summary: pickSummary("unknown", allReasons),
        compared,
      };
    }
    return {
      verdict: "limited",
      reasons: allReasons,
      summary: pickSummary("limited", allReasons),
      compared,
    };
  }

  return {
    verdict: "unknown",
    reasons: allReasons,
    summary: pickSummary("unknown", allReasons),
    compared,
  };
}
