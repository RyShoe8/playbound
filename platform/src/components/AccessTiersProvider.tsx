"use client";

import { createContext, useContext, type ReactNode } from "react";
import { FREE_TIER, tierFor, type GameTier, type GameTierMap } from "@/lib/access/tiers";

const AccessTiersContext = createContext<GameTierMap>({});

export function AccessTiersProvider({
  tiers,
  children,
}: {
  tiers: GameTierMap;
  children: ReactNode;
}) {
  return <AccessTiersContext.Provider value={tiers}>{children}</AccessTiersContext.Provider>;
}

export function useGameTier(slug: string): GameTier {
  const map = useContext(AccessTiersContext);
  return tierFor(map, slug);
}

export function useAccessTiers(): GameTierMap {
  return useContext(AccessTiersContext);
}
