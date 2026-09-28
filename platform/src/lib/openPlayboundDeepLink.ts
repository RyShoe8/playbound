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

const PLAYBOUND_HANDOFF_MS = 2000;

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

export const DISCORD_HANDOFF_MS = 2500;

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

/** Open an https URL in a new tab from a user gesture. */
function openHttpsInNewTab(url: string): Window | null {
  const w = window.open(url, "_blank");
  if (w) {
    try {
      w.opener = null;
    } catch {
      /* ignore */
    }
    return w;
  }
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return null;
}

/**
 * The one way every Discord button on the site opens an invite: the desktop
 * app first, the browser only when the app never takes focus.
 *
 * discord:// starts Discord even when it is not running, so the fallback waits
 * DISCORD_HANDOFF_MS for the tab to blur or hide before opening web Discord —
 * opening both on every click put people in two Discords, and opening only the
 * web invite never joined the app they were signed into.
 *
 * Call it synchronously from the click handler. Chrome refuses a custom
 * protocol launch without a recent user gesture, so a deep link fired after an
 * awaited fetch can be dropped silently — which is how "Join Discord" did
 * nothing when the app was closed. Callers that need a server round trip first
 * (provisioning a voice room) should open the invite they already have, then
 * do the round trip in the background.
 */
export function openDiscordInvite(inviteUrl: string): () => void {
  const httpsUrl = inviteUrl;
  const code = parseDiscordInviteCode(inviteUrl);
  if (!code) {
    openHttpsInNewTab(httpsUrl);
    return () => {};
  }

  let handedOff = false;
  const onHandoff = () => {
    handedOff = true;
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") handedOff = true;
  };
  window.addEventListener("blur", onHandoff);
  window.addEventListener("pagehide", onHandoff);
  document.addEventListener("visibilitychange", onVisibility);
  const cleanup = () => {
    window.clearTimeout(timer);
    window.removeEventListener("blur", onHandoff);
    window.removeEventListener("pagehide", onHandoff);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  const timer = window.setTimeout(() => {
    cleanup();
    if (!handedOff) openHttpsInNewTab(httpsUrl);
  }, DISCORD_HANDOFF_MS);

  firePlayboundDeepLink(`discord://-/invite/${code}`);
  return cleanup;
}

/** Trigger a file download (or open the download page) in a new gesture-safe way. */
function startLauncherDownload(downloadUrl: string): void {
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
