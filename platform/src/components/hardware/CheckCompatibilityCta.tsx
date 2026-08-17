"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { launcherSyncUrl } from "@/lib/launcher";
import { openPlayboundDeepLink } from "@/lib/openPlayboundDeepLink";
import { shouldOfferLauncher } from "@/lib/mobilePlay";
import { useDevice } from "@/hooks/useDevice";
import { useTelemetry } from "@/lib/telemetry";

type Props = {
  gameSlug?: string;
  surface: "game_page" | "profile" | "discover";
  /** Signed-in primary label */
  signedInLabel?: string;
  /** Guest primary label */
  guestLabel?: string;
  className?: string;
  /** Fired when the deep link handoff reports the launcher opened. */
  onLauncherOpened?: () => void;
  /** Override status hint (e.g. parent is polling for profile). */
  statusHint?: string | null;
};

/**
 * Opens installed launcher via playbound://sync (library + hardware) for signed-in users;
 * guests go to /launcher. Soft fallback to /launcher on handoff miss (no auto-download).
 * Hidden on phones/tablets — launcher sync is desktop-only.
 */
export function CheckCompatibilityCta({
  gameSlug,
  surface,
  signedInLabel = "Open PlayBound to sync your PC",
  guestLabel = "Get the launcher",
  className = "mt-3 inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:brightness-110",
  onLauncherOpened,
  statusHint,
}: Props) {
  const device = useDevice();
  const { status } = useSession();
  const { track } = useTelemetry();
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prevStatus, setPrevStatus] = useState(status);

  if (status !== prevStatus) {
    setPrevStatus(status);
    setHint(null);
  }

  if (!shouldOfferLauncher(device.type)) {
    return null;
  }

  const displayedHint = statusHint ?? hint;

  function trackClick() {
    track("check_compatibility_cta_clicked", {
      gameSlug,
      surface,
    });
  }

  function tryOpenLauncher() {
    trackClick();
    setBusy(true);
    setHint("Opening PlayBound…");
    openPlayboundDeepLink(launcherSyncUrl(), {
      onResult: (result) => {
        setBusy(false);
        if (result === "launched") {
          setHint("Opened PlayBound — syncing your hardware…");
          onLauncherOpened?.();
        } else {
          setHint("Couldn’t open the app. Install or open PlayBound, then try again.");
        }
      },
    });
  }

  if (status === "authenticated") {
    return (
      <div className="mt-3 space-y-2">
        <button type="button" disabled={busy} onClick={tryOpenLauncher} className={className}>
          {signedInLabel}
        </button>
        {displayedHint ? <p className="text-xs text-muted-foreground">{displayedHint}</p> : null}
        {displayedHint?.includes("Couldn’t") ? (
          <Link href="/launcher" className="block text-xs font-semibold text-primary hover:underline">
            Go to launcher download page
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <Link
        href="/launcher"
        onClick={trackClick}
        className={className}
      >
        {guestLabel}
      </Link>
      <button
        type="button"
        onClick={tryOpenLauncher}
        className="block text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        I already have PlayBound — open it
      </button>
      {displayedHint ? <p className="text-xs text-muted-foreground">{displayedHint}</p> : null}
    </div>
  );
}
