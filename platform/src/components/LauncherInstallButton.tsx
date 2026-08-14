"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, MonitorPlay } from "lucide-react";
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
  const [status, setStatus] = useState<"idle" | "trying" | "downloaded">("idle");
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

  function openLauncher() {
    void track("install_clicked", {
      gameSlug: slug,
      source: kind === "install-mod" ? "launcher_mod" : "launcher",
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
      onClick={openLauncher}
      disabled={status === "trying"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-6 py-2.5 text-sm font-bold transition-all hover:bg-secondary/70 active:translate-y-px",
        status === "downloaded" && "border-primary/50 bg-primary/10 text-primary",
        className
      )}
    >
      {status === "trying" ? (
        <>
          <Loader2 className="size-4 animate-spin text-primary" />
          Opening PlayBound…
        </>
      ) : status === "downloaded" ? (
        <>
          <Download className="size-4 text-primary" />
          Downloading {osLabel} Launcher…
        </>
      ) : (
        <>
          <MonitorPlay className="size-4" />
          {label}
        </>
      )}
    </button>
  );
}

