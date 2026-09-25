"use client";

import { useLauncherOs } from "@/hooks/useLauncherOs";

import { useState } from "react";
import Link from "next/link";
import { Download, Loader2, MonitorPlay, Play } from "lucide-react";
import type { Game } from "@/lib/data/types";
import type { DiscoverListingGame } from "@/lib/discoverListing";
import { isBrowserGame } from "@/lib/gameLaunch";
import { launcherInstallUrl, launcherPlayUrl } from "@/lib/launcher";
import {
  launcherDownloadUrlForOs,
  launcherOsLabel,
} from "@/lib/launcherDownload";
import {
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
import { useGameTier } from "@/components/AccessTiersProvider";
import { accessPriceLabel } from "@/lib/access/discoveryMode";
import { directPurchaseRequired, isBaseGameRequirement } from "@/lib/access/resolver";
import {
  parseMobileOs,
  resolveMobileOutbound,
  shouldOfferLauncher,
} from "@/lib/mobilePlay";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { withOutboundUtm } from "@/lib/utm";
import { formatEditionChipName, getEditionChips as getDisplayEditionsForGame } from "@/lib/data/editionChips";

function sizeLabel(sizeMB: number) {
  return sizeMB >= 1000 ? `${(sizeMB / 1000).toFixed(1)} GB` : `${sizeMB} MB`;
}

const ctaSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-7 text-base",
};

/** The fields PlayCta reads, so card-sized projections can use it too. */
export type PlayCtaGame = Pick<Game,
  "slug" | "title" | "access" | "website" | "browserPlayable" | "launchMethods" | "androidStoreUrl" | "iosStoreUrl"
> & { launcherInstall?: { kind?: string; url?: string } | Game["launcherInstall"] };

export function PlayCta({
  game,
  size = "md",
  emphasis = "primary",
  installed,
}: {
  game: PlayCtaGame;
  size?: "sm" | "md" | "lg";
  emphasis?: "primary" | "secondary";
  installed?: boolean;
}) {
  const { device } = useCompatibilityFilter();
  const { track } = useTelemetry();
  const [status, setStatus] = useState<"idle" | "trying" | "downloaded">("idle");
  const os = useLauncherOs();
  const isInstalled = Boolean(installed || (game as { installed?: boolean }).installed);
  const paid = directPurchaseRequired(game.access);
  const installLabel = isInstalled ? "Play" : paid ? "Install" : "Get It Free";


  const className = cn(
    "inline-flex items-center gap-2 rounded-full font-bold transition-all hover:brightness-110 active:translate-y-px cursor-pointer select-none",
    emphasis === "secondary"
      ? "border border-border bg-secondary text-foreground"
      : "bg-play text-play-foreground shadow-[0_0_24px_-6px_var(--play)]",
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
        {paid ? "Play" : "Play Free"}
      </TelemetryAnchor>
    );
  }

  const externalClaimUrl =
    !isInstalled &&
    !paid &&
    game.launcherInstall?.kind === "external" &&
    /^https:\/\//i.test(game.launcherInstall.url || "")
      ? game.launcherInstall.url
      : null;
  if (externalClaimUrl) {
    const href = withOutboundUtm(externalClaimUrl, {
      campaign: "game_get",
      content: game.slug,
    });
    return (
      <TelemetryAnchor
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
        event="official_download_clicked"
        properties={{ gameSlug: game.slug, url: href, source: "play_cta" }}
      >
        <Download className={iconClass} />
        Get It Free
      </TelemetryAnchor>
    );
  }

  const downloadUrl = launcherDownloadUrlForOs(os);
  const osLabel = launcherOsLabel(os);
  const deepLink = isInstalled ? launcherPlayUrl(game.slug) : launcherInstallUrl(game.slug);

  function handleInstall(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void track(isInstalled ? "play_clicked" : "install_clicked", {
      gameSlug: game.slug,
      source: "play_cta",
    });
    setStatus("trying");
    openPlayboundDeepLink(deepLink, {
      downloadUrl,
      autoDownload: !isInstalled,
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
      title={isInstalled ? `Play ${game.title}` : `Install ${game.title} with PlayBound Launcher`}
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
      ) : isInstalled ? (
        <>
          <Play className={cn(iconClass, "fill-current")} />
          Play
        </>
      ) : (
        <>
          <Download className={iconClass} />
          {installLabel}
        </>
      )}
    </button>
  );
}

export function LaunchBadge({ game }: { game: DiscoverListingGame }) {
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

function IncompatibleCorner({ game }: { game: DiscoverListingGame }) {
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
  game: DiscoverListingGame;
  className?: string;
  playingNow?: number;
}) {
  const count = playingNow ?? 0;
  const isBaseGameReq = isBaseGameRequirement(game.access);
  const tier = useGameTier(game.slug);
  const price = isBaseGameReq ? "FREE" : accessPriceLabel(tier.fromPriceCents);
  const displayEditions = getDisplayEditionsForGame(game.slug);

  return (
    <Link
      href={`/games/${game.slug}`}
      /*
       * Whether this game runs on a phone, decided on the server.
       *
       * The server has no device to filter for — the layout is static, and
       * useDevice only resolves after hydration — so every listing renders the
       * desktop set. On a phone that is 74 of 94 published games appearing and
       * then vanishing. A media query on this attribute hides them at first
       * paint instead, with no cookie, no inline script, and no cost to the
       * prerendered HTML. globals.css has the rule.
       */
      data-mobile-compat={isGameCompatible(game, "mobile") ? "true" : "false"}
      className={cn(
        "group flex h-full w-[250px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] sm:w-[276px]",
        className
      )}
    >
      <div className="relative w-full aspect-[3/4] shrink-0 overflow-hidden">
        <GameArt game={game} className="size-full" />
        <IncompatibleCorner game={game} />
        <div className="absolute top-2 right-2 z-20">
          <LaunchBadge game={game} />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2 border-t border-border/70 bg-card/90 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold tracking-wide text-muted-foreground">{price}</p>
          <CardCategoryTags
            genres={game.genres}
            tags={game.tags}
            size="sm"
            max={3}
            className="mt-1.5 min-w-0"
          />
          {displayEditions.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="font-bold text-primary/75 text-[11px]">Editions:</span>
              {displayEditions.slice(0, 2).map((e) => (
                <span
                  key={e.slug}
                  className="max-w-[110px] truncate rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-semibold text-foreground/80 leading-tight"
                  title={e.name}
                >
                  {formatEditionChipName(e.name)}
                </span>
              ))}
              {displayEditions.length > 2 ? (
                <span className="text-[11px] font-medium text-muted-foreground">
                  +{displayEditions.length - 2}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
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
