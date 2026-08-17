/**
 * Open a playbound:// deep link. If the OS doesn't hand off to the launcher
 * (tab stays focused), optionally auto-start the Setup download.
 *
 * Browsers cannot detect protocol registration — blur / visibility loss is the
 * standard heuristic that the desktop app took focus.
 */

import {
  detectLauncherOsFromUa,
  type LauncherOs,
} from "@/lib/launcherDownload";

export const PLAYBOUND_HANDOFF_MS = 2000;

export type PlayboundHandoffResult = "launched" | "download" | "miss";

export type { LauncherOs };

export function detectLauncherOs(): LauncherOs {
  if (typeof navigator === "undefined") return "windows";
  return detectLauncherOsFromUa(navigator.userAgent);
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

export const DISCORD_HANDOFF_MS = 1200;

/** Invite code from discord.gg / discord.com/invite URLs. */
export function parseDiscordInviteCode(inviteUrl: string): string | null {
  try {
    const u = new URL(inviteUrl);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);
    if (host === "discord.gg" || host === "discordapp.com") {
      return parts[0] || null;
    }
    if (host === "discord.com" && parts[0] === "invite" && parts[1]) {
      return parts[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Open an https URL in a new tab from a user gesture (not delayed window.open). */
function openHttpsInNewTab(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Prefer the Discord desktop app via discord://, and always open the https
 * invite on the same click so people without the app still get Discord web.
 * A Windows protocol prompt blurs the tab without hiding it — that is not
 * treated as a successful app handoff.
 */
export function openDiscordInvite(inviteUrl: string): () => void {
  const httpsUrl = inviteUrl;
  const code = parseDiscordInviteCode(inviteUrl);
  openHttpsInNewTab(httpsUrl);
  if (code) {
    firePlayboundDeepLink(`discord://-/invite/${code}`);
  }
  return () => {};
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
 * Will only auto-start installer download if `autoDownload: true` is explicitly passed.
 */
export function openPlayboundDeepLink(
  deepLink: string,
  opts?: {
    downloadUrl?: string | null;
    autoDownload?: boolean;
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
    if (result === "miss" && opts?.downloadUrl && opts?.autoDownload) {
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
