import Link from "next/link";
import { Download, MonitorPlay } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { isBrowserGame } from "@/lib/gameLaunch";
import { GameArt } from "./GameArt";
import { Badge } from "./ui/bits";
import { cn } from "@/lib/utils";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";

function sizeLabel(sizeMB: number) {
  return sizeMB >= 1000 ? `${(sizeMB / 1000).toFixed(1)} GB` : `${sizeMB} MB`;
}

const ctaSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-7 text-base",
};

export function PlayCta({ game, size = "md" }: { game: Game; size?: "sm" | "md" | "lg" }) {
  const className = cn(
    "inline-flex items-center gap-2 rounded-full bg-play font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px",
    ctaSizes[size]
  );
  const iconClass = cn(size === "lg" ? "size-5" : "size-4");

  if (isBrowserGame(game)) {
    return (
      <TelemetryAnchor
        href={game.website}
        target="_blank"
        rel="noreferrer"
        className={className}
        event="official_download_clicked"
        properties={{ gameSlug: game.slug, url: game.website }}
      >
        <MonitorPlay className={iconClass} />
        Play Free
      </TelemetryAnchor>
    );
  }

  return (
    <Link href={`/games/${game.slug}/play`} className={className}>
      <Download className={iconClass} />
      Get It Free
    </Link>
  );
}

export function LaunchBadge({ game }: { game: Game }) {
  if (isBrowserGame(game) || game.browserPlayable) {
    return (
      <Badge tone="play">
        <MonitorPlay className="size-3" /> Instant
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <Download className="size-3" /> {sizeLabel(game.sizeMB)}
    </Badge>
  );
}

export function GameCard({ game, className }: { game: Game; className?: string }) {
  return (
    <Link href={`/games/${game.slug}`} className={cn("group w-44 shrink-0 snap-start sm:w-48", className)}>
      <div className="relative overflow-hidden rounded-xl border border-border transition-all duration-200 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]">
        <GameArt game={game} className="aspect-[3/4]" />
        <div className="absolute top-2 right-2">
          <LaunchBadge game={game} />
        </div>
      </div>
      <div className="mt-2 space-y-0.5 px-0.5">
        <p className="truncate text-sm font-semibold">{game.title}</p>
        <p className="truncate text-xs text-muted-foreground">{game.genres.join(" · ")}</p>
      </div>
    </Link>
  );
}

/** Horizontally scrolling card row with snap. */
export function CardRow({ children }: { children: React.ReactNode }) {
  return <div className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pt-1 pb-2">{children}</div>;
}
