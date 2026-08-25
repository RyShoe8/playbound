"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  Gamepad2,
  Loader2,
  MonitorPlay,
  RotateCw,
  Server,
  ShieldCheck,
  Sparkles,
  Wifi,
} from "lucide-react";
import {
  launcherDownloadUrlForOs,
  launcherOsLabel,
  type LauncherOs,
} from "@/lib/launcherDownload";
import {
  detectLauncherOs,
  openPlayboundDeepLink,
  firePlayboundDeepLink,
} from "@/lib/openPlayboundDeepLink";
import { Badge } from "@/components/ui/bits";

interface Props {
  gameSlug: string;
  gameTitle: string;
  coverImage?: string | null;
  host?: string | null;
  port?: number | null;
  serverName?: string | null;
  editionSlug?: string | null;
  eventId?: string | null;
  action?: "join" | "install" | "play";
}

export function LaunchGatewayClient({
  gameSlug,
  gameTitle,
  coverImage,
  host,
  port,
  serverName,
  editionSlug,
  eventId,
  action = "join",
}: Props) {
  const [status, setStatus] = useState<"launching" | "launched" | "downloading" | "idle">("launching");
  const [os, setOs] = useState<LauncherOs>("windows");

  // Construct target deep link
  const deepLink = (() => {
    if (host && port) {
      const q = new URLSearchParams({ host, port: String(port) });
      if (serverName) q.set("name", serverName.slice(0, 80));
      if (editionSlug) q.set("edition", editionSlug);
      return `playbound://join/${gameSlug}?${q.toString()}`;
    }
    if (action === "install") {
      return editionSlug
        ? `playbound://install/${gameSlug}?edition=${encodeURIComponent(editionSlug)}`
        : `playbound://install/${gameSlug}`;
    }
    return `playbound://play/${gameSlug}`;
  })();

  const webGameUrl = editionSlug
    ? `/games/${gameSlug}/editions/${editionSlug}`
    : `/games/${gameSlug}`;
  const webEventUrl = eventId ? `/events/${eventId}` : webGameUrl;

  useEffect(() => {
    const detected = detectLauncherOs();
    setOs(detected);
    const downloadUrl = launcherDownloadUrlForOs(detected);

    // Automatically trigger deep link handoff on mount
    setStatus("launching");
    openPlayboundDeepLink(deepLink, {
      downloadUrl,
      autoDownload: false, // Don't aggressively auto-download on initial click, give user clear download UI if not installed
      onResult: (result) => {
        if (result === "download" || result === "miss") {
          setStatus("downloading");
        } else {
          setStatus("launched");
        }
      },
    });

    // Fallback timer to show manual controls if no OS event blurred tab
    const timer = setTimeout(() => {
      setStatus((prev) => (prev === "launching" ? "launched" : prev));
    }, 2500);

    return () => clearTimeout(timer);
  }, [deepLink]);

  const handleManualLaunch = () => {
    setStatus("launching");
    firePlayboundDeepLink(deepLink);
    setTimeout(() => setStatus("launched"), 2000);
  };

  const downloadUrl = launcherDownloadUrlForOs(os);
  const osLabel = launcherOsLabel(os);

  return (
    <div className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl border border-border/80 bg-card/80 p-6 shadow-2xl backdrop-blur-xl sm:p-10">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />

      <div className="relative z-10 space-y-8 text-center">
        {/* Game Art & Header */}
        <div className="flex flex-col items-center gap-4">
          {coverImage ? (
            <div className="relative h-28 w-48 overflow-hidden rounded-2xl border border-border/80 shadow-lg shadow-black/40">
              <img
                src={coverImage.startsWith("http") ? coverImage : `https://playbound.club${coverImage}`}
                alt={gameTitle}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Gamepad2 className="size-10" />
            </div>
          )}

          <div className="space-y-1">
            <Badge tone="brand">
              <Sparkles className="size-3" /> 1-Click Game Launch
            </Badge>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {gameTitle}
            </h1>
            {host && port && (
              <div className="flex items-center justify-center gap-2 text-xs font-mono font-semibold text-muted-foreground">
                <Server className="size-3 text-emerald-400" />
                <span>Dedicated Server: <span className="text-foreground">{host}:{port}</span></span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Status Display */}
        <div className="rounded-2xl border border-border/60 bg-background/50 p-6 text-center space-y-3">
          {status === "launching" ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="font-bold text-foreground">Handoff to PlayBound Launcher in progress…</p>
              <p className="text-xs text-muted-foreground">
                Confirm any browser prompt asking to open the PlayBound app.
              </p>
            </div>
          ) : status === "downloading" ? (
            <div className="flex flex-col items-center gap-3">
              <Download className="size-8 text-primary animate-bounce" />
              <p className="font-bold text-foreground">PlayBound Launcher Required</p>
              <p className="text-xs text-muted-foreground max-w-md">
                To connect in 1 click and automatically install missing files, install the free desktop launcher.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <ShieldCheck className="size-8 text-emerald-400" />
              <p className="font-bold text-foreground">Launch Signal Dispatched!</p>
              <p className="text-xs text-muted-foreground">
                The PlayBound Launcher will automatically verify game files and connect you to the server.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleManualLaunch}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110 sm:w-auto"
          >
            <RotateCw className="size-4" />
            Launch Game & Join Again
          </button>

          <a
            href={downloadUrl}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary px-6 text-sm font-bold hover:bg-secondary/80 sm:w-auto"
          >
            <Download className="size-4 text-primary" />
            Get {osLabel} Launcher
          </a>
        </div>

        {/* How It Works Checklist */}
        <div className="border-t border-border/60 pt-6 text-left">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 text-center sm:text-left">
            What happens next?
          </h2>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
              <span><strong>Auto-Install / Sync:</strong> If you don&apos;t have the game installed, the launcher extracts the official verified package.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
              <span><strong>Instant Connection:</strong> Passes server IP and port directly into the game engine so you skip manual server typing.</span>
            </li>
          </ul>
        </div>

        {/* Back Link */}
        <div className="pt-2">
          <Link
            href={webEventUrl}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
            Return to Event & Community Details
          </Link>
        </div>
      </div>
    </div>
  );
}
