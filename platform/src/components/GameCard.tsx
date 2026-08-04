"use client";

import Link from "next/link";
import { Download, MonitorPlay } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { isBrowserGame } from "@/lib/gameLaunch";
import { GameArt } from "./GameArt";
import { Badge } from "./ui/bits";
import { cn } from "@/lib/utils";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";
import { GamePlatformBadges } from "@/components/GamePlatformBadges";
import { useIncompatibilityLabel } from "@/components/compatibility/useFilteredGames";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import {
  parseMobileOs,
  resolveMobileOutbound,
  shouldOfferLauncher,
} from "@/lib/mobilePlay";

function sizeLabel(sizeMB: number) {
  return sizeMB >= 1000 ? `${(sizeMB / 1000).toFixed(1)} GB` : `${sizeMB} MB`;
}

const ctaSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-7 text-base",
};

export function PlayCta({ game, size = "md" }: { game: Game; size?: "sm" | "md" | "lg" }) {
  const { device } = useCompatibilityFilter();
  const className = cn(
    "inline-flex items-center gap-2 rounded-full bg-play font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px",
    ctaSizes[size]
  );
  const iconClass = cn(size === "lg" ? "size-5" : "size-4");

  // Phones/tablets: browser, store, or official site — never the desktop launcher /play path.
  if (!shouldOfferLauncher(device.type)) {
    const os =
      typeof navigator !== "undefined" ? parseMobileOs(navigator.userAgent) : "other";
    const outbound = resolveMobileOutbound(game, os);
    return (
      <TelemetryAnchor
        href={outbound.href}
        target="_blank"
        rel="noreferrer"
        className={className}
        event="official_download_clicked"
        properties={{ gameSlug: game.slug, url: outbound.href, surface: "mobile_cta" }}
      >
        {outbound.label === "Play Free" ? (
          <MonitorPlay className={iconClass} />
        ) : (
          <Download className={iconClass} />
        )}
        {outbound.label}
      </TelemetryAnchor>
    );
  }

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

function IncompatibleCorner({ game }: { game: Game }) {
  const label = useIncompatibilityLabel(game);
  if (!label) return null;
  return (
    <span className="absolute top-2 left-2 rounded-md border border-border/80 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
      {label}
    </span>
  );
}

export function GameCard({ game, className }: { game: Game; className?: string }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className={cn(
        "group flex h-full w-44 shrink-0 snap-start flex-col sm:w-48",
        className
      )}
    >
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-border transition-all duration-200 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]">
        <GameArt game={game} className="aspect-[3/4]" />
        <IncompatibleCorner game={game} />
        <div className="absolute top-2 right-2">
          <LaunchBadge game={game} />
        </div>
      </div>
      <div className="mt-2 flex min-h-[4.75rem] flex-1 flex-col gap-0.5 px-0.5">
        <p className="truncate text-sm font-semibold">{game.title}</p>
        <p className="truncate text-xs text-muted-foreground">{game.genres.join(" · ")}</p>
        <GamePlatformBadges game={game} compact singleLine className="mt-auto" />
      </div>
    </Link>
  );
}

/** Horizontally scrolling card row with snap. */
export function CardRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-1 flex snap-x items-stretch gap-4 overflow-x-auto px-1 pt-1 pb-2">
      {children}
    </div>
  );
}
