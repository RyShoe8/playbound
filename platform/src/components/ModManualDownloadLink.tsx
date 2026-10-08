"use client";

import { useTelemetry } from "@/lib/telemetry";

/** A link click is measurable; installing files outside PlayBound is not. */
export function ModManualDownloadLink({
  href,
  modSlug,
  baseGameSlug,
  label,
  primary = false,
}: {
  href: string;
  modSlug: string;
  baseGameSlug: string;
  label: string;
  primary?: boolean;
}) {
  const { track } = useTelemetry();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        void track("mod_download_clicked", {
          modSlug,
          baseGameSlug,
          url: href,
          source: "mod_page",
        });
      }}
      className={primary
        ? "inline-flex items-center justify-center rounded-full bg-play px-4 py-2 text-sm font-bold text-play-foreground"
        : "inline-flex items-center rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"}
    >
      {label}
    </a>
  );
}
