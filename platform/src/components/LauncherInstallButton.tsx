"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, MonitorPlay } from "lucide-react";
import { launcherInstallUrl, launcherInstallModUrl } from "@/lib/launcher";
import {
  launcherDownloadUrlForOs,
  launcherOsLabel,
  type LauncherOs,
} from "@/lib/launcherDownload";
import {
  detectLauncherOs,
  openPlayboundDeepLink,
} from "@/lib/openPlayboundDeepLink";
import { shouldOfferLauncher } from "@/lib/mobilePlay";
import { useDevice } from "@/hooks/useDevice";
import { cn } from "@/lib/utils";
import { useTelemetry } from "@/lib/telemetry";

type Props = {
  slug: string;
  /** Default: install game. Use install-mod for mods. */
  kind?: "install" | "install-mod";
  className?: string;
  label?: string;
};

export function LauncherInstallButton({
  slug,
  kind = "install",
  className,
  label = "Install with PlayBound Launcher",
}: Props) {
  const device = useDevice();
  const [status, setStatus] = useState<"idle" | "trying" | "downloaded" | "miss">("idle");
  const [os, setOs] = useState<LauncherOs>("windows");
  const { track } = useTelemetry();
  const deepLink = kind === "install-mod" ? launcherInstallModUrl(slug) : launcherInstallUrl(slug);

  useEffect(() => {
    setOs(detectLauncherOs());
  }, []);

  if (!shouldOfferLauncher(device.type)) {
    return null;
  }

  const downloadUrl = launcherDownloadUrlForOs(os);
  const osLabel = launcherOsLabel(os);
  const showFallback = status === "downloaded" || status === "miss";

  function openLauncher() {
    void track("install_clicked", {
      gameSlug: slug,
      source: kind === "install-mod" ? "launcher_mod" : "launcher",
    });
    setStatus("trying");
    openPlayboundDeepLink(deepLink, {
      downloadUrl,
      onResult: (result) => {
        if (result === "download") setStatus("downloaded");
        else if (result === "miss") setStatus("miss");
        else setStatus("idle");
      },
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={openLauncher}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-6 py-2.5 text-sm font-bold transition-colors hover:bg-secondary/70",
          className
        )}
      >
        <MonitorPlay className="size-4" />
        {label}
      </button>
      {status === "downloaded" && (
        <p className="text-xs font-semibold text-primary">Downloading PlayBound Launcher…</p>
      )}
      {downloadUrl ? (
        <a
          href={downloadUrl}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Don&apos;t have it yet? Download the launcher
        </a>
      ) : (
        <Link href="/launcher" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          Don&apos;t have it yet?
        </Link>
      )}
      {showFallback && (
        <div className="mt-1 max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">
            {status === "downloaded" ? "Launcher download started" : "Didn&apos;t open?"}
          </p>
          <p className="mt-1">
            {status === "downloaded"
              ? `Install and run PlayBound once so ${osLabel} registers playbound://, then click Install again.`
              : `Install the PlayBound Launcher and run it once so ${osLabel} registers playbound://, then try again.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
              >
                <Download className="size-3" /> Download for {osLabel}
              </a>
            ) : (
              <Link href="/launcher" className="font-bold text-primary hover:underline">
                Get the launcher
              </Link>
            )}
            <button
              type="button"
              onClick={openLauncher}
              className="font-bold text-foreground hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
