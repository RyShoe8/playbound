"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, MonitorPlay, X } from "lucide-react";
import type { LauncherOs } from "@/lib/launcherDownload";
import { useTelemetry } from "@/lib/telemetry";

export function GameDownloadChoiceModal({
  slug, title, os, website, onLauncher, onClose,
}: {
  slug: string;
  title: string;
  os: LauncherOs;
  website: string;
  onLauncher: () => void;
  onClose: () => void;
}) {
  const [download, setDownload] = useState<{ url: string; direct: boolean; sourceType?: string | null } | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { track } = useTelemetry();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/games/${encodeURIComponent(slug)}/direct-download?os=${os}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: { url?: string; direct?: boolean; sourceType?: string | null } | null) => {
        if (value?.url) setDownload({ url: value.url, direct: Boolean(value.direct), sourceType: value.sourceType });
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLookupDone(true); });
    return () => controller.abort();
  }, [slug, os]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEscape);
    return () => { document.removeEventListener("keydown", onEscape); previous?.focus(); };
  }, [onClose]);

  const officialWebsite = /^https:\/\//i.test(website) ? website : null;
  const outbound = download ?? (lookupDone && officialWebsite ? { url: officialWebsite, direct: false } : null);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="game-download-choice-title" className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href]')];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
      }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="game-download-choice-title" className="text-lg font-bold">Get {title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose how you want to play.</p>
          </div>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-4" /></button>
        </div>
        <button type="button" onClick={onLauncher} className="mt-5 flex w-full items-center gap-3 rounded-xl bg-play p-3 text-left text-play-foreground hover:brightness-110">
          <MonitorPlay className="size-5 shrink-0" />
          <span><strong className="block text-sm">Install with PlayBound</strong><span className="block text-xs opacity-85">Auto updates, improved controller support, and expanded multiplayer.</span></span>
        </button>
        {outbound ? (
          <a href={outbound.url} target="_blank" rel="noopener noreferrer" onClick={() => {
            void track(outbound.direct ? "game_download_clicked" : "official_download_clicked", {
              gameSlug: slug,
              gameTitle: title,
              url: outbound.url,
              platform: os,
              source: outbound.direct ? "manual_file" : "official_site",
              surface: "download_choice",
              ...(outbound.direct ? { deliverySource: outbound.sourceType || "public" } : {}),
            });
            onClose();
          }} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-border bg-secondary p-3 text-left hover:bg-secondary/70">
            {outbound.direct ? <Download className="size-5 shrink-0" /> : <ExternalLink className="size-5 shrink-0" />}
            <span><strong className="block text-sm">{outbound.direct ? "Download the game file" : "Open official game site"}</strong><span className="block text-xs text-muted-foreground">No PlayBound Launcher needed.</span></span>
          </a>
        ) : lookupDone ? (
          <p className="mt-2 px-1 text-xs text-muted-foreground">A direct download is unavailable for this game.</p>
        ) : (
          <div className="mt-2 rounded-xl border border-border p-3 text-sm text-muted-foreground">Finding the official download…</div>
        )}
      </div>
    </div>,
    document.body
  );
}
