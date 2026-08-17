"use client";

import { useEffect, useState } from "react";
import { FolderSearch, Loader2, Download } from "lucide-react";
import { launcherLocateUrl } from "@/lib/launcher";
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
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
};

const locateButtonSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

export function LocateGameButton({
  slug,
  className,
  label = "Already own it?",
  size = "md",
}: Props) {
  const device = useDevice();
  const [status, setStatus] = useState<"idle" | "trying" | "downloaded">("idle");
  const [os, setOs] = useState<LauncherOs>("windows");
  const { track } = useTelemetry();

  useEffect(() => {
    setOs(detectLauncherOs());
  }, []);

  // Only offer launcher locate to desktop devices
  if (!shouldOfferLauncher(device.type)) {
    return null;
  }

  const downloadUrl = launcherDownloadUrlForOs(os);
  const osLabel = launcherOsLabel(os);
  const deepLink = launcherLocateUrl(slug);

  function handleLocate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void track("locate_clicked", {
      gameSlug: slug,
      source: "locate_button",
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
      onClick={handleLocate}
      disabled={status === "trying"}
      title="Link an existing installation on your computer to PlayBound"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-secondary font-bold transition-all hover:bg-secondary/70 hover:border-primary/40 active:translate-y-px cursor-pointer select-none",
        locateButtonSizes[size],
        status === "downloaded" && "border-primary/50 bg-primary/10 text-primary",
        className
      )}
    >
      {status === "trying" ? (
        <>
          <Loader2 className={cn("animate-spin text-primary", size === "lg" ? "size-5" : "size-4")} />
          Opening Launcher…
        </>
      ) : status === "downloaded" ? (
        <>
          <Download className={cn("text-primary", size === "lg" ? "size-5" : "size-4")} />
          Downloading {osLabel} Launcher…
        </>
      ) : (
        <>
          <FolderSearch className={cn(size === "lg" ? "size-5" : "size-4")} />
          {label}
        </>
      )}
    </button>
  );
}
