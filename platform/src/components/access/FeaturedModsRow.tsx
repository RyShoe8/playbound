"use client";

import type { CatalogModPublic } from "@/lib/mods";
import { CardRow } from "@/components/GameCard";
import { ModPreviewCard } from "@/components/ModPreviewCard";
import { SectionHeader } from "@/components/ui/bits";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { useAccessTiers } from "@/components/AccessTiersProvider";
import { filterBySlugAccess } from "@/lib/access/discoveryMode";
import { isModCompatible } from "@/lib/compatibility/compatibility";

export type FeaturedMod = {
  mod: CatalogModPublic;
  baseGame: {
    slug?: string;
    title?: string;
    coverImage?: string | null;
    platforms?: string[];
    browserPlayable?: boolean;
    steamDeck?: boolean;
  } | null;
};

/**
 * The homepage's mods row, narrowed in the browser.
 *
 * A mod inherits its base game's tier, so FREE mode hides mods whose base game
 * is paid. Resolving that on the server meant a cookie read, which is what kept
 * the homepage from ever being prerendered.
 *
 * `candidates` is deliberately longer than `limit` — the server sends a pool
 * and the slice happens here, after the filter. Slicing first would leave FREE
 * viewers short whenever a paid-base mod landed in the top few, which is the
 * same order the server code used for the same reason.
 */
export function FeaturedModsRow({
  candidates,
  limit = 8,
}: {
  candidates: FeaturedMod[];
  limit?: number;
}) {
  const { mode: discoveryMode } = useDiscoveryMode();
  const { mode: compatMode, device } = useCompatibilityFilter();
  const tiers = useAccessTiers();

  const accessible = filterBySlugAccess(
    candidates,
    discoveryMode,
    tiers,
    (c) => c.mod.baseGameSlug
  );

  const visible = (
    compatMode === "all"
      ? accessible
      : accessible.filter((c) => isModCompatible(c.mod, c.baseGame, device.type))
  ).slice(0, limit);

  if (visible.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Mods" subtitle="Packageable add-ons for PlayBound titles" href="/mods" />
      <CardRow>
        {visible.map(({ mod, baseGame }) => (
          <ModPreviewCard key={mod.slug} mod={mod} baseGame={baseGame} />
        ))}
      </CardRow>
    </section>
  );
}
