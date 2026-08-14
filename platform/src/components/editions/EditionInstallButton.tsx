"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Play, Terminal } from "lucide-react";
import { telemetry } from "@/lib/telemetry";
import type { InstallAction } from "@/lib/editionInstall";
import {
  launcherDownloadUrlForOs,
  type LauncherOs,
} from "@/lib/launcherDownload";
import {
  detectLauncherOs,
  openPlayboundDeepLink,
} from "@/lib/openPlayboundDeepLink";
import { shouldOfferLauncher } from "@/lib/mobilePlay";
import { useDevice } from "@/hooks/useDevice";
import { cn } from "@/lib/utils";

/**
 * Renders whatever install action an edition resolved to.
 *
 * Deliberately knows nothing about install methods — it switches on the four
 * InstallAction kinds instead, so adding a storefront to the resolver registry
 * needs no change here. Fires edition_install_clicked with both the game and
 * edition identity attached.
 */
export function EditionInstallButton({
  action,
  telemetryProps,
  size = "md",
  variant = "primary",
}: {
  action: InstallAction;
  telemetryProps: Record<string, unknown>;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
}) {
  const device = useDevice();
  const [os, setOs] = useState<LauncherOs>("windows");
  const [status, setStatus] = useState<"idle" | "trying" | "downloaded">("idle");

  useEffect(() => {
    setOs(detectLauncherOs());
  }, []);

  const sizes = {
    sm: "h-9 px-4 text-sm",
    md: "h-11 px-6 text-sm",
    lg: "h-12 px-7 text-base",
  }[size];

  const tone =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:brightness-110"
      : "border border-border bg-secondary text-foreground hover:bg-secondary/80";

  const className = `inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors ${sizes} ${tone}`;

  // Nothing to click: the edition has no usable configuration for its method.
  if (action.unavailableReason) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        {action.unavailableReason}
      </div>
    );
  }

  // Written steps are rendered by the install section, not as a button.
  if (action.kind === "instructions") return null;

  const Icon =
    action.kind === "browser" ? Play : action.kind === "launcher" ? Download : ExternalLink;

  function record() {
    telemetry.track("edition_install_clicked", {
      ...telemetryProps,
      installMethod: action.method,
    });
  }

  // playbound:// handoff — auto-download Setup if the launcher isn't registered.
  // Phones/tablets never get the launcher, so hide this path entirely.
  if (action.kind === "launcher") {
    if (!shouldOfferLauncher(device.type)) {
      return (
        <p className="max-w-xs text-sm text-muted-foreground">
          Install this edition with the PlayBound Launcher on a Windows, Mac, or Linux computer.
        </p>
      );
    }

    const downloadUrl = launcherDownloadUrlForOs(os);

    return (
      <button
        type="button"
        disabled={status === "trying"}
        className={cn(className, status === "downloaded" && "border-primary/50 bg-primary/10 text-primary")}
        onClick={() => {
          record();
          setStatus("trying");
          openPlayboundDeepLink(action.href ?? "", {
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
        }}
      >
        <Icon className="size-4" />
        {status === "trying"
          ? "Opening PlayBound…"
          : status === "downloaded"
          ? "Downloading Launcher…"
          : action.label}
      </button>
    );
  }

  return (
    <Link
      href={action.href ?? "#"}
      onClick={record}
      target={action.external ? "_blank" : undefined}
      rel={action.external ? "noopener noreferrer" : undefined}
      className={className}
    >
      <Icon className="size-4" />
      {action.label}
    </Link>
  );
}

/** Written install steps, for the manual method (or as a supplement). */
export function EditionInstallSteps({
  steps,
}: {
  steps: { platform?: string; text: string; command?: string | null }[];
}) {
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            {step.platform && step.platform !== "all" && (
              <span className="mb-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase text-muted-foreground">
                {step.platform}
              </span>
            )}
            <p className="text-sm leading-relaxed">{step.text}</p>
            {step.command && (
              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs">
                <code className="flex items-center gap-2">
                  <Terminal className="size-3 shrink-0 text-muted-foreground" />
                  {step.command}
                </code>
              </pre>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
