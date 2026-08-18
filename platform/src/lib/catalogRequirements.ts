import { hasStructuredRequirements } from "@/lib/hardware/mergeRequirements";
import type { Game } from "@/lib/data/types";

const PLACEHOLDER_REQ =
  /^(see official site|-|tbd|n\/a|n\/a\.|none|unknown|todo|modern web browser)$/i;

export function isUsableSystemRequirements(
  req: unknown
): req is Game["systemRequirements"] {
  if (!req || typeof req !== "object") return false;
  const min = String((req as { min?: string }).min || "").trim();
  return Boolean(min) && !PLACEHOLDER_REQ.test(min);
}

export function pickSystemRequirements(
  stored: unknown,
  seed?: Game["systemRequirements"],
  extra?: Game["systemRequirements"]
): Game["systemRequirements"] {
  if (isUsableSystemRequirements(stored)) return stored;
  if (isUsableSystemRequirements(seed)) return seed;
  if (isUsableSystemRequirements(extra)) return extra;
  if (stored && typeof stored === "object" && "min" in stored) {
    return stored as Game["systemRequirements"];
  }
  return { min: "", recommended: "" };
}

export function pickHardwareRequirements(
  stored: Game["hardwareRequirements"] | null | undefined,
  seed?: Game["hardwareRequirements"] | null,
  extra?: Game["hardwareRequirements"] | null
): Game["hardwareRequirements"] {
  if (hasStructuredRequirements(stored)) return stored ?? null;
  if (hasStructuredRequirements(seed)) return seed ?? null;
  if (hasStructuredRequirements(extra)) return extra ?? null;
  return stored || seed || extra || null;
}
