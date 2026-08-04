"use client";

import type { Game } from "@/lib/data/types";
import { CardRow, GameCard } from "@/components/GameCard";
import { CompatibilityListingBar } from "@/components/GameCompatibilityToggle";
import {
  CompatibleGamesFade,
  useFilteredGames,
} from "@/components/compatibility/useFilteredGames";

export function CompatibleCardRow({ games }: { games: Game[] }) {
  const filtered = useFilteredGames(games);
  const animKey = filtered.map((g) => g.slug).join(",");

  return (
    <div className="space-y-3">
      <CompatibilityListingBar />
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No compatible titles — switch to All Games to see everything.
        </p>
      ) : (
        <CompatibleGamesFade animKey={animKey}>
          <CardRow>
            {filtered.map((g, i) => (
              <div
                key={g.slug}
                className="opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <GameCard game={g} />
              </div>
            ))}
          </CardRow>
        </CompatibleGamesFade>
      )}
    </div>
  );
}
