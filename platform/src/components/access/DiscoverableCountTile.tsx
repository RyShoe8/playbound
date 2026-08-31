"use client";

import { StatTile } from "@/components/ui/bits";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { useAccessTiers } from "@/components/AccessTiersProvider";
import { filterBySlugAccess } from "@/lib/access/discoveryMode";

/**
 * A "how many" tile that agrees with what the viewer can actually see.
 *
 * Pages that used to narrow their game list on the server now render the
 * canonical, unfiltered set so the response can be cached once and served to
 * everybody. The browser applies the viewer's discovery mode afterwards, which
 * leaves any server-rendered count stating a number the grid below it
 * contradicts. This recomputes it from the same predicate the grid uses.
 *
 * Discovery mode only, deliberately. The compatibility filter also hides
 * cards, and this tile has never counted that — it answers "how many games are
 * there", not "how many cards are on screen". Matching the old number rather
 * than the visible cards is what makes moving the filter off the server a
 * behaviour-neutral change.
 *
 * During SSR `useDiscoveryMode` reports the default (ALL), so the prerendered
 * HTML carries the full count and a FREE viewer's browser narrows it on
 * hydration — the same sequence the card grids already follow.
 */
export function DiscoverableCountTile({
  label,
  slugs,
  hint,
  href,
}: {
  label: string;
  slugs: string[];
  hint?: string;
  href?: string;
}) {
  const { mode } = useDiscoveryMode();
  const tiers = useAccessTiers();
  const visible = mode === "FREE" ? filterBySlugAccess(slugs, "FREE", tiers, (s) => s) : slugs;

  return <StatTile label={label} value={String(visible.length)} hint={hint} href={href} />;
}
