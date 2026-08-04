"use client";

import type { Game } from "@/lib/data/types";
import { CompatibilityListingBar } from "@/components/GameCompatibilityToggle";
import { CompatibleGameCardGrid } from "@/components/CompatibleGameCardGrid";
import { SectionHeader } from "@/components/ui/bits";
import { useFilteredGames } from "@/components/compatibility/useFilteredGames";

export function SearchGameResults({ games }: { games: Game[] }) {
  const filtered = useFilteredGames(games);

  return (
    <section className="space-y-4">
      <CompatibilityListingBar />
      <SectionHeader title={`Games (${filtered.length})`} />
      <CompatibleGameCardGrid games={games} />
    </section>
  );
}
