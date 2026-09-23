import { Badge } from "@/components/ui/bits";
import type { ControlSupportLevel } from "@/lib/controlProfiles/service";

/**
 * Public controller-support classification — deliberately not a blanket
 * "Controller Supported" badge, which implies native support a game may not
 * actually have. See src/lib/controlProfiles/service.ts's
 * `classifyControlSupport` for how the level is derived.
 */
const LABELS: Record<ControlSupportLevel, { text: string; tone: "play" | "neutral" | "warn" }> = {
  native: { text: "Native controller support", tone: "play" },
  playbound_enhanced: { text: "PlayBound Enhanced", tone: "play" },
  playbound_profile_available: { text: "PlayBound Profile Available", tone: "neutral" },
  partial: { text: "Partial controller support", tone: "warn" },
  unsupported: { text: "No controller support", tone: "neutral" },
};

const DESCRIPTIONS: Record<ControlSupportLevel, string> = {
  native: "This game natively supports a controller — no setup needed.",
  playbound_enhanced:
    "This game has no native controller support. PlayBound automatically maps controller input to keyboard and mouse when you press Play.",
  playbound_profile_available:
    "A PlayBound controller profile exists for this game but hasn't been verified yet — it may not activate automatically.",
  partial: "This game supports a controller, but not fully or reliably.",
  unsupported: "This game has no native or PlayBound-enhanced controller support yet.",
};

export function ControlSupportBadge({ level }: { level: ControlSupportLevel }) {
  const { text, tone } = LABELS[level];
  return (
    <div className="flex flex-col gap-1">
      <Badge tone={tone} className="w-fit">
        {text}
      </Badge>
      <p className="max-w-2xl text-xs text-muted-foreground">{DESCRIPTIONS[level]}</p>
    </div>
  );
}
