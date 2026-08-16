"use client";

import type { Game } from "@/lib/data/types";
import { CompatibleGameCardGrid } from "@/components/CompatibleGameCardGrid";
import { SectionHeader } from "@/components/ui/bits";
import { useFilteredGames } from "@/components/compatibility/useFilteredGames";

export function SearchGameResults({
  games,
  playingNowBySlug = {},
}: {
  games: Game[];
  playingNowBySlug?: Record<string, number>;
}) {
  const filtered = useFilteredGames(games);

  return (
    <section className="space-y-4">
      <SectionHeader title={`Games (${filtered.length})`} />
      <CompatibleGameCardGrid games={games} playingNowBySlug={playingNowBySlug} />
    </section>
  );
}
