"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  launcherDownloadUrlForOs,
  launcherOsLabel,
  type LauncherOs,
} from "@/lib/launcherDownload";
import { detectLauncherOs } from "@/lib/openPlayboundDeepLink";
import { shouldOfferLauncher } from "@/lib/mobilePlay";
import { useDevice } from "@/hooks/useDevice";

export function LauncherHeroDownload() {
  const device = useDevice();
  const [os, setOs] = useState<LauncherOs>("windows");

  useEffect(() => {
    setOs(detectLauncherOs());
  }, []);

  if (!shouldOfferLauncher(device.type)) {
    return (
      <p className="mt-6 max-w-xl rounded-lg border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
        The PlayBound Launcher is a desktop app for Windows, macOS, and Linux. On a phone or tablet,
        use each game&apos;s store or browser Play button instead.
      </p>
    );
  }

  const downloadUrl = launcherDownloadUrlForOs(os);
  const platformName = launcherOsLabel(os);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {downloadUrl ? (
        <a
          href={downloadUrl}
          className="inline-flex items-center gap-2 rounded-full bg-play px-6 py-3 text-sm font-bold text-play-foreground transition-all hover:brightness-110"
        >
          <Download className="size-4" /> Download for {platformName}
        </a>
      ) : (
        <p className="rounded-lg border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
          Download URL not configured. Set{" "}
          <code className="text-play">NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL</code>,{" "}
          <code className="text-play">NEXT_PUBLIC_LAUNCHER_MAC_DOWNLOAD_URL</code>, or{" "}
          <code className="text-play">NEXT_PUBLIC_LAUNCHER_LINUX_DOWNLOAD_URL</code> after uploading
          the installer to Vercel Blob.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {platformName}
        {os === "linux" ? " AppImage" : ""} · run once to register deep links
      </p>
    </div>
  );
}
