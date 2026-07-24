import Link from "next/link";
import { Download, MonitorPlay, Play, TrendingUp } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameArt } from "./GameArt";
import { Badge, PlayersOnline, Rating } from "./ui/bits";
import { cn } from "@/lib/utils";

export function PlayCta({ game, size = "md" }: { game: Game; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-4 text-sm",
    lg: "h-12 px-7 text-base",
  };
  return (
    <Link
      href={`/games/${game.slug}/play`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-play font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px",
        sizes[size]
      )}
    >
      <Play className={cn("fill-current", size === "lg" ? "size-5" : "size-4")} />
      Play
    </Link>
  );
}

export function LaunchBadge({ game }: { game: Game }) {
  if (game.browserPlayable) {
    return (
      <Badge tone="play">
        <MonitorPlay className="size-3" /> Instant
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <Download className="size-3" /> {game.sizeMB && game.sizeMB >= 1000 ? `${(game.sizeMB / 1000).toFixed(1)} GB` : `${game.sizeMB} MB`}
    </Badge>
  );
}

export function GameCard({
  game,
  showGrowth = false,
  className,
}: {
  game: Game;
  showGrowth?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className={cn(
        "group w-44 shrink-0 snap-start sm:w-48",
        className
      )}
    >
      <div className="relative overflow-hidden rounded-xl border border-border transition-all duration-200 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]">
        <GameArt game={game} className="aspect-[3/4]" />
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {showGrowth && game.weeklyGrowth > 10 && (
            <Badge tone="warn" className="backdrop-blur">
              <TrendingUp className="size-3" /> +{game.weeklyGrowth}%
            </Badge>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <LaunchBadge game={game} />
        </div>
      </div>
      <div className="mt-2 space-y-1 px-0.5">
        <div className="flex items-center justify-between gap-2">
          <Rating value={game.rating} />
          <span className="truncate text-xs text-muted-foreground">{game.genres[0]}</span>
        </div>
        <PlayersOnline count={game.playersOnline} className="text-xs" />
      </div>
    </Link>
  );
}

/** Horizontally scrolling card row with snap. */
export function CardRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pt-1 pb-2">
      {children}
    </div>
  );
}
