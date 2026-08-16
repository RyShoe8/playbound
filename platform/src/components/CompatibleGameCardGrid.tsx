"use client";

import type { Game } from "@/lib/data/types";
import { GameCard } from "@/components/GameCard";
import {
  CompatibleGamesFade,
  useFilteredGames,
} from "@/components/compatibility/useFilteredGames";
import { cn } from "@/lib/utils";

export function CompatibleGameCardGrid({
  games,
  className,
  soft = false,
  playingNowBySlug = {},
}: {
  games: Game[];
  className?: string;
  soft?: boolean;
  playingNowBySlug?: Record<string, number>;
}) {
  const filtered = useFilteredGames(games, soft ? { soft: true, limit: games.length } : undefined);
  const animKey = `${filtered.map((g) => g.slug).join(",")}|${filtered.length}`;

  if (filtered.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No compatible games match. Switch to All Games to browse the full catalog.
      </p>
    );
  }

  return (
    <CompatibleGamesFade animKey={animKey}>
      <div
        className={cn(
          "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
          className
        )}
      >
        {filtered.map((g, i) => (
          <div
            key={g.slug}
            className="opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
            style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
          >
            <GameCard
              game={g}
              className="w-full sm:w-full"
              playingNow={playingNowBySlug[g.slug] ?? 0}
            />
          </div>
        ))}
      </div>
    </CompatibleGamesFade>
  );
}

export function CompatibleMoreLikeThis({
  games,
  playingNowBySlug = {},
}: {
  games: Game[];
  playingNowBySlug?: Record<string, number>;
}) {
  const ordered = useFilteredGames(games, { soft: true, limit: 6, ratio: 0.9 });
  if (!ordered.length) return null;
  return (
    <CompatibleGamesFade animKey={ordered.map((g) => g.slug).join(",")}>
      <div className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pt-1 pb-2">
        {ordered.map((g, i) => (
          <div
            key={g.slug}
            className="opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <GameCard game={g} playingNow={playingNowBySlug[g.slug] ?? 0} />
          </div>
        ))}
      </div>
    </CompatibleGamesFade>
  );
}
