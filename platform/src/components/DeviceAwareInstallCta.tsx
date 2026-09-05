"use client";


import type { Game } from "@/lib/data/types";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import {
  parseMobileOs,
  resolveMobileOutbound,
  shouldOfferLauncher,
} from "@/lib/mobilePlay";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { MobileOutboundCta } from "@/components/MobileOutboundCta";

/** Launcher on desktop; store/website on mobile — for Install tab + similar. */
export function DeviceAwareInstallCta({
  game,
  oneClick,
}: {
  game: Game;
  oneClick: boolean;
}) {
  const { device } = useCompatibilityFilter();
  const offerLauncher = shouldOfferLauncher(device.type);

  if (!offerLauncher) {
    const os =
      typeof navigator !== "undefined" ? parseMobileOs(navigator.userAgent) : "other";
    const outbound = resolveMobileOutbound(game, os);
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        {/*
          The heading has to agree with the button under it.
          "Get it on this device" over "Open official site" promises an install
          we cannot give — the same thing the button itself used to do for
          games with no store listing, one level up.
        */}
        <p className="font-bold">
          {outbound.label === "Open official site" ? "Where to get it" : "Get it on this device"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {outbound.label === "Open official site"
            ? "No app store listing for this one, so this opens the official site. The PlayBound desktop launcher is for computers."
            : "Opens the official store or project site. The PlayBound desktop launcher is for computers."}
        </p>
        <div className="mt-4">
          {/* Adds the game to this device's library on the way out — a store
              install otherwise left no trace at all. */}
          <MobileOutboundCta
            game={game}
            outbound={outbound}
            surface="install_tab_mobile"
            className="inline-flex items-center gap-2 rounded-full bg-play px-5 py-2.5 text-sm font-bold text-play-foreground hover:brightness-110"
          />
        </div>
      </div>
    );
  }

  if (!oneClick) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="font-bold">One-click install</p>
      <p className="mt-1 text-sm text-muted-foreground">
        PlayBound fetches the official release — no third-party mirrors.
      </p>
      <div className="mt-4">
        <LauncherInstallButton
          slug={game.slug}
          label={`Install ${game.title} with PlayBound Launcher`}
        />
      </div>
    </div>
  );
}
