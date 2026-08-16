"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, MonitorPlay } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { isBrowserGame } from "@/lib/gameLaunch";
import { launcherInstallUrl } from "@/lib/launcher";
import {
  launcherDownloadUrlForOs,
  launcherOsLabel,
  type LauncherOs,
} from "@/lib/launcherDownload";
import {
  detectLauncherOs,
  openPlayboundDeepLink,
} from "@/lib/openPlayboundDeepLink";
import { useTelemetry } from "@/lib/telemetry";
import { GameArt } from "./GameArt";
import { Badge } from "./ui/bits";
import { cn } from "@/lib/utils";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";
import { MobileOutboundCta } from "@/components/MobileOutboundCta";
import { CardCategoryTags } from "@/components/CardCategoryTags";
import { useIncompatibilityLabel } from "@/components/compatibility/useFilteredGames";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import {
  parseMobileOs,
  resolveMobileOutbound,
  shouldOfferLauncher,
} from "@/lib/mobilePlay";
import { withOutboundUtm } from "@/lib/utm";

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
  const { track } = useTelemetry();
  const [status, setStatus] = useState<"idle" | "trying" | "downloaded">("idle");
  const [os, setOs] = useState<LauncherOs>("windows");

  useEffect(() => {
    setOs(detectLauncherOs());
  }, []);

  const className = cn(
    "inline-flex items-center gap-2 rounded-full bg-play font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px cursor-pointer select-none",
    ctaSizes[size]
  );
  const iconClass = cn(size === "lg" ? "size-5" : "size-4");

  // Phones/tablets: browser, store, or official site — never the desktop launcher path.
  if (!shouldOfferLauncher(device.type)) {
    const mobileOs =
      typeof navigator !== "undefined" ? parseMobileOs(navigator.userAgent) : "other";
    const outbound = resolveMobileOutbound(game, mobileOs);
    return (
      <MobileOutboundCta
        game={game}
        outbound={outbound}
        surface="mobile_cta"
        className={className}
      />
    );
  }

  if (isBrowserGame(game)) {
    const href = withOutboundUtm(game.website, {
      campaign: "game_card",
      content: game.slug,
    });
    return (
      <TelemetryAnchor
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
        event="official_download_clicked"
        properties={{ gameSlug: game.slug, url: href }}
      >
        <MonitorPlay className={iconClass} />
        Play Free
      </TelemetryAnchor>
    );
  }

  const downloadUrl = launcherDownloadUrlForOs(os);
  const osLabel = launcherOsLabel(os);
  const deepLink = launcherInstallUrl(game.slug);

  function handleInstall(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void track("install_clicked", {
      gameSlug: game.slug,
      source: "play_cta",
    });
    setStatus("trying");
    openPlayboundDeepLink(deepLink, {
      downloadUrl,
      autoDownload: true,
      onResult: (result) => {
        if (result === "download") {
          setStatus("downloaded");
          setTimeout(() => setStatus("idle"), 6000);
        } else {
          setTimeout(() => setStatus("idle"), 2500);
        }
      },
    });
  }

  return (
    <button
      type="button"
      onClick={handleInstall}
      disabled={status === "trying"}
      className={className}
      title={`Install ${game.title} with PlayBound Launcher`}
    >
      {status === "trying" ? (
        <>
          <Loader2 className={cn(iconClass, "animate-spin")} />
          Opening…
        </>
      ) : status === "downloaded" ? (
        <>
          <Download className={iconClass} />
          Downloading {osLabel}…
        </>
      ) : (
        <>
          <Download className={iconClass} />
          Get It Free
        </>
      )}
    </button>
  );
}

export function LaunchBadge({ game }: { game: Game }) {
  const { track } = useTelemetry();

  if (isBrowserGame(game)) {
    const href = withOutboundUtm(game.website, {
      campaign: "game_card",
      content: game.slug,
    });
    return (
      <button
        type="button"
        className="relative z-20"
        title={`Play ${game.title}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void track("official_download_clicked", {
            gameSlug: game.slug,
            url: href,
            source: "card_play",
          });
          window.open(href, "_blank", "noopener,noreferrer");
        }}
      >
        <Badge tone="play">
          <MonitorPlay className="size-3" /> Play
        </Badge>
      </button>
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

export function GameCard({
  game,
  className,
  playingNow,
}: {
  game: Game;
  className?: string;
  playingNow?: number;
}) {
  const count = playingNow ?? 0;
  return (
    <Link
      href={`/games/${game.slug}`}
      className={cn(
        "group flex h-full w-[250px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] sm:w-[276px]",
        className
      )}
    >
      <div className="relative shrink-0 overflow-hidden">
        <GameArt game={game} className="aspect-[3/4]" />
        <IncompatibleCorner game={game} />
        <div className="absolute top-2 right-2 z-20">
          <LaunchBadge game={game} />
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 border-t border-border/70 bg-card/90 px-2.5 py-2">
        <CardCategoryTags
          genres={game.genres}
          tags={game.tags}
          size="md"
          className="min-w-0 flex-1"
        />
        {count > 0 ? (
          <p className="mt-0.5 flex shrink-0 items-center gap-1.5 tabular-nums text-[11px] font-semibold text-muted-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
            </span>
            {count.toLocaleString()} playing
          </p>
        ) : null}
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
