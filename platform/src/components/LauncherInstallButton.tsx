"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, MonitorPlay } from "lucide-react";
import { launcherInstallUrl, launcherInstallModUrl } from "@/lib/launcher";
import { LAUNCHER_DOWNLOAD_URL } from "@/lib/launcherDownload";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  /** Default: install game. Use install-mod for mods. */
  kind?: "install" | "install-mod";
  className?: string;
  label?: string;
};

const FALLBACK_MS = 1500;

export function LauncherInstallButton({
  slug,
  kind = "install",
  className,
  label = "Install with PlayBound Launcher",
}: Props) {
  const [showFallback, setShowFallback] = useState(false);
  const deepLink = kind === "install-mod" ? launcherInstallModUrl(slug) : launcherInstallUrl(slug);
  const downloadUrl = LAUNCHER_DOWNLOAD_URL;

  function openLauncher() {
    setShowFallback(false);
    const a = document.createElement("a");
    a.href = deepLink;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => setShowFallback(true), FALLBACK_MS);
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
          <p className="font-semibold text-foreground">Didn&apos;t open?</p>
          <p className="mt-1">
            Install the PlayBound Launcher and run it once so Windows registers{" "}
            <code className="text-play">playbound://</code>, then try again.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
              >
                <Download className="size-3" /> Download for Windows
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
