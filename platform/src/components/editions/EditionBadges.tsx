import { BadgeCheck, CircleAlert, CircleHelp, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/bits";
import {
  EDITION_STATUS_LABELS,
  EDITION_TYPE_LABELS,
  VERIFICATION_DESCRIPTIONS,
  VERIFICATION_LABELS,
  type Edition,
  type VerificationLevel,
} from "@/lib/editionTypes";

/**
 * Certification badge.
 *
 * The tone is deliberately conservative: only levels PlayBound or the
 * developers actually stand behind get a positive colour. "Untested" reads as
 * a caution rather than a neutral label, because for a community server the
 * difference matters to whoever is about to download it.
 */
export function VerificationBadge({
  level,
  showLabel = true,
}: {
  level: VerificationLevel;
  showLabel?: boolean;
}) {
  const config: Record<
    VerificationLevel,
    { tone: "brand" | "play" | "warn" | "neutral" | "outline"; icon: typeof ShieldCheck }
  > = {
    official: { tone: "play", icon: ShieldCheck },
    playbound_verified: { tone: "brand", icon: BadgeCheck },
    community_verified: { tone: "outline", icon: Users },
    untested: { tone: "warn", icon: CircleHelp },
    deprecated: { tone: "warn", icon: CircleAlert },
  };
  const { tone, icon: Icon } = config[level];

  // Badge takes no title attribute, so the hover explanation lives on a
  // wrapper — worth keeping, since "Community Verified" vs "PlayBound
  // Verified" is exactly the distinction a reader wants explained in place.
  return (
    <span title={VERIFICATION_DESCRIPTIONS[level]} className="inline-flex">
      <Badge tone={tone}>
        <Icon className="size-3" />
        {showLabel && VERIFICATION_LABELS[level]}
      </Badge>
    </span>
  );
}

/** Edition type — Official, Community, Private server, … */
export function EditionTypeBadge({ edition }: { edition: Edition }) {
  return (
    <Badge tone={edition.type === "official" ? "play" : "neutral"}>
      {EDITION_TYPE_LABELS[edition.type]}
    </Badge>
  );
}

/**
 * Lifecycle badge. Rendered only when it is not "active", so a healthy edition
 * carries no redundant chrome.
 */
export function EditionStatusBadge({ edition }: { edition: Edition }) {
  if (edition.status === "active") return null;
  return (
    <Badge tone={edition.status === "coming_soon" ? "outline" : "warn"}>
      {EDITION_STATUS_LABELS[edition.status]}
    </Badge>
  );
}

/**
 * Live population. Renders nothing unless a real number exists — an unknown
 * player count must never be shown as zero.
 */
export function EditionPopulationBadge({ edition }: { edition: Edition }) {
  if (edition.population == null) return null;
  return (
    <Badge tone="neutral">
      <Users className="size-3" />
      {edition.population.toLocaleString()} online
    </Badge>
  );
}
