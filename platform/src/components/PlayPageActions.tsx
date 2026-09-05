"use client";

import { Download, ExternalLink, MonitorPlay } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { useGameSession } from "@/hooks/useGameSession";
import { isLauncherInstallable } from "@/lib/launcher";
import { isBrowserGame } from "@/lib/gameLaunch";
import {
  parseMobileOs,
  resolveMobileOutbound,
  shouldOfferLauncher,
} from "@/lib/mobilePlay";
import { withOutboundUtm } from "@/lib/utm";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";
import { MobileOutboundCta } from "@/components/MobileOutboundCta";

export function PlayPageActions({
  game,
  officialHref,
}: {
  game: Game;
  officialHref: string;
}) {
  const { device } = useCompatibilityFilter();
  const { startSession } = useGameSession();
  const oneClick = isLauncherInstallable(game);
  const browser = isBrowserGame(game);
  const offerLauncher = shouldOfferLauncher(device.type);
  const officialTracked = withOutboundUtm(officialHref, {
    campaign: "game_play",
    content: game.slug,
  });
  const websiteTracked = withOutboundUtm(game.website, {
    campaign: "game_play",
    content: game.slug,
  });

  if (!offerLauncher) {
    const os =
      typeof navigator !== "undefined" ? parseMobileOs(navigator.userAgent) : "other";
    const outbound = resolveMobileOutbound(game, os);
    const host = (() => {
      try {
        return new URL(outbound.href).hostname.replace(/^www\./, "");
      } catch {
        return outbound.href;
      }
    })();
    const secondaryOfficial = withOutboundUtm(officialHref, {
      campaign: "play_page_mobile_secondary",
      content: game.slug,
    });

    return (
      <>
        {/* Handles the click event, the play session and the library claim —
            previously only the first two happened here. */}
        <MobileOutboundCta
          game={game}
          outbound={outbound}
          surface="play_page_mobile"
          className="mt-2 flex items-center gap-2 rounded-full bg-play px-6 py-2.5 text-sm font-bold text-play-foreground transition-all hover:brightness-110"
        >
          {/*
            The website fallback names the host, since "Open official site" on
            its own does not say whose. The resolver no longer emits
            "Get It Free" — it implied an app install for games with no store.
          */}
          {outbound.label === "Open official site" ? `Open ${host}` : outbound.label}
        </MobileOutboundCta>
        {outbound.href !== officialHref ? (
          <TelemetryAnchor
            href={secondaryOfficial}
            target="_blank"
            rel="noreferrer"
            event="official_download_clicked"
            properties={{
              gameSlug: game.slug,
              url: secondaryOfficial,
              surface: "play_page_mobile_secondary",
            }}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-4" /> Official site
          </TelemetryAnchor>
        ) : null}
      </>
    );
  }

  if (browser) {
    return (
      <TelemetryAnchor
        href={websiteTracked}
        target="_blank"
        rel="noreferrer"
        event="official_download_clicked"
        properties={{ gameSlug: game.slug, url: websiteTracked }}
        className="mt-2 flex items-center gap-2 rounded-full bg-play px-6 py-2.5 text-sm font-bold text-play-foreground transition-all hover:brightness-110"
        onClick={() => startSession(game.slug, game.title)}
      >
        <ExternalLink className="size-4" /> Play Free
      </TelemetryAnchor>
    );
  }

  return (
    <>
      {oneClick ? (
        <LauncherInstallButton
          slug={game.slug}
          className="mt-2 border-transparent bg-play px-6 py-2.5 text-play-foreground hover:brightness-110"
        />
      ) : null}
      <TelemetryAnchor
        href={officialTracked}
        target="_blank"
        rel="noreferrer"
        event="official_download_clicked"
        properties={{ gameSlug: game.slug, url: officialTracked }}
        className={
          oneClick
            ? "flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            : "mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        }
      >
        <ExternalLink className="size-4" /> Official download
      </TelemetryAnchor>
    </>
  );
}

export function PlayPageHeading({ game }: { game: Game }) {
  const { device } = useCompatibilityFilter();
  const offerLauncher = shouldOfferLauncher(device.type);
  const browser = isBrowserGame(game);

  if (!offerLauncher) {
    const os =
      typeof navigator !== "undefined" ? parseMobileOs(navigator.userAgent) : "other";
    const outbound = resolveMobileOutbound(game, os);
    if (outbound.label === "Play Free") {
      return (
        <>
          <MonitorPlay className="size-10 text-primary" />
          <h1 className="text-2xl font-extrabold">Play {game.title}</h1>
          <p className="text-sm text-muted-foreground">
            No download or launcher needed — {game.title} opens in your browser on the official
            site.
          </p>
        </>
      );
    }
    return (
      <>
        <Download className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Get {game.title}</h1>
        <p className="text-sm text-muted-foreground">
          Install or download {game.title} on this device from the official store or project site.
          The PlayBound desktop launcher is for computers.
        </p>
      </>
    );
  }

  if (browser) {
    return (
      <>
        <MonitorPlay className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Play {game.title} in your browser</h1>
        <p className="text-sm text-muted-foreground">
          No download or launcher needed — {game.title} runs on the web.
        </p>
      </>
    );
  }

  const oneClick = isLauncherInstallable(game);
  return (
    <>
      <Download className="size-10 text-primary" />
      <h1 className="text-2xl font-extrabold">Install {game.title} for free</h1>
      <p className="text-sm text-muted-foreground">
        {game.title} is {game.license.toLowerCase()}.{" "}
        {oneClick
          ? "Install with the PlayBound Launcher for the simplest path — or grab it from the official project."
          : "Download it from the official project."}{" "}
        {game.sizeMB >= 1000 ? `${(game.sizeMB / 1000).toFixed(1)} GB` : `${game.sizeMB} MB`}{" "}
        download.
      </p>
    </>
  );
}
