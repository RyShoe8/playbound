"use client";

import { cn } from "@/lib/utils";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import {
  filterGamesForPreference,
  incompatibilityBadge,
  prioritizeCompatible,
  type GameLike,
} from "@/lib/compatibility/compatibility";

import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { useAccessTiers } from "@/components/AccessTiersProvider";
import { filterBySlugAccess } from "@/lib/access/discoveryMode";

/** Soft fade when the filtered set changes. */
export function CompatibleGamesFade({
  children,
  className,
  animKey,
}: {
  children: React.ReactNode;
  className?: string;
  animKey: string;
}) {
  return (
    <div key={animKey} className={cn("animate-in fade-in duration-300", className)}>
      {children}
    </div>
  );
}

/**
 * Apply global compatibility and discovery mode preferences.
 * - default: hard-filter when mode is "compatible" or discovery mode is "FREE"
 * - soft: reorder ~90% compatible / 10% other (recommendations); never hard-exclude
 */
export function useFilteredGames<T extends GameLike>(
  games: T[],
  options?: { prioritize?: boolean; soft?: boolean; limit?: number; ratio?: number }
): T[] {
  const { mode, device } = useCompatibilityFilter();
  const { mode: discoveryMode } = useDiscoveryMode();
  const tiers = useAccessTiers();
  const limit = options?.limit ?? games.length;
  const ratio = options?.ratio ?? 0.9;

  let accessibleGames = games;
  if (discoveryMode === "FREE") {
    accessibleGames = filterBySlugAccess(games, "FREE", tiers, (g) => (g as { slug?: string }).slug);
  }

  if (options?.soft || (options?.prioritize && mode === "all")) {
    return prioritizeCompatible(accessibleGames, device.type, { ratio, limit });
  }

  const filtered = filterGamesForPreference(accessibleGames, mode, device.type);
  if (options?.prioritize) {
    return prioritizeCompatible(filtered, device.type, { ratio: 1, limit });
  }
  return filtered.slice(0, limit);
}

export function useIncompatibilityLabel(game: GameLike): string | null {
  const { mode, device } = useCompatibilityFilter();
  if (mode !== "all") return null;
  return incompatibilityBadge(game, device.type);
}
