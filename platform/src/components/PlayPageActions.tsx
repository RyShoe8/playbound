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
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";

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

    return (
      <>
        <TelemetryAnchor
          href={outbound.href}
          target="_blank"
          rel="noreferrer"
          event="official_download_clicked"
          properties={{ gameSlug: game.slug, url: outbound.href, surface: "play_page_mobile" }}
          className="mt-2 flex items-center gap-2 rounded-full bg-play px-6 py-2.5 text-sm font-bold text-play-foreground transition-all hover:brightness-110"
          onClick={() => outbound.label === "Play Free" && startSession(game.slug, game.title)}
        >
          {outbound.label === "Play Free" ? (
            <MonitorPlay className="size-4" />
          ) : (
            <Download className="size-4" />
          )}
          {outbound.label === "Get It Free" ? `Get It Free on ${host}` : outbound.label}
        </TelemetryAnchor>
        {outbound.href !== officialHref ? (
          <TelemetryAnchor
            href={officialHref}
            target="_blank"
            rel="noreferrer"
            event="official_download_clicked"
            properties={{ gameSlug: game.slug, url: officialHref, surface: "play_page_mobile_secondary" }}
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
        href={game.website}
        target="_blank"
        rel="noreferrer"
        event="official_download_clicked"
        properties={{ gameSlug: game.slug, url: game.website }}
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
        href={officialHref}
        target="_blank"
        rel="noreferrer"
        event="official_download_clicked"
        properties={{ gameSlug: game.slug, url: officialHref }}
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
