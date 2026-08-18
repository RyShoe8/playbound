/**
 * The slug → tier lookup shape, with no database in the module.
 *
 * Client components (cards, the discovery toggle) need this map. Putting the
 * Mongo read in the same file pulled mongoose into the browser bundle and
 * broke the production build. Lookups live here; `tiers.ts` is the server read.
 */

import type { AccessTier, Cents } from "./types";

export interface GameTier {
  tier: AccessTier;
  /** Cheapest price a player pays today — card label, not eligibility. */
  fromPriceCents: Cents | null;
  /** Cheapest qualifying price across the chain. Catalog / ceiling. */
  qualifyingPriceCents: Cents | null;
  /** What has to be bought, so the UI can say why rather than only that. */
  requires: Array<{
    label: string;
    slug: string | null;
    qualifyingPriceCents: Cents | null;
    currentPriceCents: Cents | null;
  }>;
}

export type GameTierMap = Record<string, GameTier>;

/** A game with no entry in the map is free — same default as an absent record. */
export const FREE_TIER: GameTier = {
  tier: "FREE",
  fromPriceCents: null,
  qualifyingPriceCents: null,
  requires: [],
};

export function tierFor(map: GameTierMap, slug: string): GameTier {
  return map[slug] ?? FREE_TIER;
}
