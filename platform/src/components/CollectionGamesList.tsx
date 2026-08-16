"use client";

import Link from "next/link";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { LaunchBadge, PlayCta } from "@/components/GameCard";
import { CardCategoryTags } from "@/components/CardCategoryTags";
import {
  CompatibleGamesFade,
  useFilteredGames,
  useIncompatibilityLabel,
} from "@/components/compatibility/useFilteredGames";

function CollectionGameRow({ game, index }: { game: Game; index: number }) {
  const badge = useIncompatibilityLabel(game);
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <span className="w-6 text-center text-lg font-extrabold text-muted-foreground">
        {index + 1}
      </span>
      <Link href={`/games/${game.slug}`} className="relative shrink-0">
        <GameArt
          game={game}
          showTitle={false}
          iconSize="sm"
          className="size-16 rounded-lg sm:size-20"
        />
        {badge ? (
          <span className="absolute top-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/games/${game.slug}`} className="font-bold hover:underline">
          {game.title}
        </Link>
        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{game.tagline}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
          <LaunchBadge game={game} />
          <span className="text-muted-foreground">{game.genres.join(" · ")}</span>
        </div>
        <CardCategoryTags genres={game.genres} tags={game.tags} className="mt-1.5" />
      </div>
      <PlayCta game={game} size="sm" />
    </div>
  );
}

export function CollectionGamesList({ games }: { games: Game[] }) {
  const filtered = useFilteredGames(games);
  const animKey = filtered.map((g) => g.slug).join(",");

  return (
    <div className="space-y-3">
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No compatible games in this collection. Switch to All Games to see every title.
        </p>
      ) : (
        <CompatibleGamesFade animKey={animKey} className="space-y-3">
          {filtered.map((game, i) => (
            <div
              key={game.slug}
              className="opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
              style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
            >
              <CollectionGameRow game={game} index={i} />
            </div>
          ))}
        </CompatibleGamesFade>
      )}
    </div>
  );
}
