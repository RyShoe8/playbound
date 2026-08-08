"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Download, ExternalLink, MonitorPlay } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { telemetry } from "@/lib/telemetry";
import { useGameSession } from "@/hooks/useGameSession";
import type { MobileOutbound } from "@/lib/mobilePlay";

/**
 * The mobile "get it / play it" button.
 *
 * Replaces a plain outbound link so that following it actually records
 * something. Previously this only fired `official_download_clicked`: a user
 * who installed SuperTuxKart from the Play Store got no library entry and no
 * install recorded, so the game never appeared on their phone's library page.
 *
 * There is no callback from an app store, so a completed install is not
 * observable — the click is the strongest signal available. The entry is
 * therefore written with `source: "store_redirect"`, which keeps it separable
 * from a launcher install that we genuinely confirmed. The user can remove it
 * if they changed their mind.
 *
 * Browser games are different: they are played, not installed, so the click
 * opens a play session instead (see useGameSession) and the entry is filed
 * under the "web" platform, which every device can see.
 */
export function MobileOutboundCta({
  game,
  outbound,
  surface,
  className,
  children,
}: {
  game: Game;
  outbound: MobileOutbound;
  /** Where on the site the click happened, for funnel analysis. */
  surface: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { startSession } = useGameSession();
  // Read here rather than threaded from each caller — all three mobile CTAs
  // live under the app-wide SessionProvider.
  const { status } = useSession();
  const isSignedIn = status === "authenticated";
  const [claimed, setClaimed] = useState(false);

  const isPlay = outbound.label === "Play Free";
  const Icon = isPlay ? MonitorPlay : outbound.label === "Open official site" ? ExternalLink : Download;

  function handleClick() {
    // Always record the click itself, unchanged from before.
    void telemetry.track("official_download_clicked", {
      gameSlug: game.slug,
      gameTitle: game.title,
      url: outbound.href,
      surface,
    });

    if (isPlay) {
      // Browser game: this is a play session, not an install.
      startSession(game.slug, game.title);
    }

    // Only signed-in users have a library to add to. Anonymous visitors still
    // get the link and the click event — nothing is blocked on auth.
    if (!isSignedIn || claimed) return;
    setClaimed(true);

    // Fire-and-forget: the navigation must not wait on our own API, and a
    // failed claim must never stop someone reaching the store. keepalive lets
    // the request finish after the page is backgrounded.
    void fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: game.slug,
        intent: "install",
        source: isPlay ? "browser" : "store_redirect",
      }),
      keepalive: true,
    }).catch(() => undefined);
  }

  return (
    <a
      href={outbound.href}
      target="_blank"
      rel="noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children ?? (
        <>
          <Icon className="size-4" />
          {outbound.label}
        </>
      )}
    </a>
  );
}
