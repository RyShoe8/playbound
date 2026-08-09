/**
 * Open a playbound:// deep link. If the OS doesn't hand off to the launcher
 * (tab stays focused), optionally auto-start the Setup download.
 *
 * Browsers cannot detect protocol registration — blur / visibility loss is the
 * standard heuristic that the desktop app took focus.
 */

export const PLAYBOUND_HANDOFF_MS = 1500;

export type PlayboundHandoffResult = "launched" | "download" | "miss";

export type LauncherOs = "windows" | "macos" | "linux";

export function detectLauncherOs(): LauncherOs {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  // Android UA also contains "Linux" — never treat phones as desktop Linux.
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "windows";
}

/** Fire a custom-protocol navigation without leaving the current page. */
export function firePlayboundDeepLink(deepLink: string): void {
  const a = document.createElement("a");
  a.href = deepLink;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Trigger a file download (or open the download page) in a new gesture-safe way. */
export function startLauncherDownload(downloadUrl: string): void {
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Attempt playbound:// then, if the tab never blurs/hides, treat as a miss.
 * When `downloadUrl` is set, auto-start the launcher installer on miss.
 */
export function openPlayboundDeepLink(
  deepLink: string,
  opts?: {
    downloadUrl?: string | null;
    timeoutMs?: number;
    onResult?: (result: PlayboundHandoffResult) => void;
  }
): () => void {
  const timeoutMs = opts?.timeoutMs ?? PLAYBOUND_HANDOFF_MS;
  let settled = false;
  let sawHandoff = false;

  const finish = (result: PlayboundHandoffResult) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (result === "miss" && opts?.downloadUrl) {
      startLauncherDownload(opts.downloadUrl);
      opts.onResult?.("download");
      return;
    }
    opts?.onResult?.(result);
  };

  const onBlur = () => {
    sawHandoff = true;
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") sawHandoff = true;
  };

  const cleanup = () => {
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearTimeout(timer);
  };

  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);

  firePlayboundDeepLink(deepLink);

  const timer = window.setTimeout(() => {
    finish(sawHandoff ? "launched" : "miss");
  }, timeoutMs);

  return () => {
    if (!settled) {
      settled = true;
      cleanup();
    }
  };
}
