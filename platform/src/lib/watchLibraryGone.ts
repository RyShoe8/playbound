import { firePlayboundDeepLink } from "@/lib/openPlayboundDeepLink";

const POLL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 90_000;

async function isStillInstalled(kind: "game" | "mod", slug: string): Promise<boolean> {
  if (kind === "game") {
    const res = await fetch("/api/library");
    if (!res.ok) return true;
    const data = (await res.json()) as {
      entries?: Array<{ gameSlug: string; installed?: boolean }>;
    };
    return (data.entries || []).some((e) => e.gameSlug === slug && e.installed);
  }
  const res = await fetch("/api/library/mods");
  if (!res.ok) return true;
  const data = (await res.json()) as { mods?: Array<{ slug: string }> };
  return (data.mods || []).some((m) => m.slug === slug);
}

/**
 * After a playbound:// uninstall handoff, wait until the library record is
 * gone (user confirmed in the launcher) then call onGone. Times out if they
 * cancel the dialog.
 */
export function watchUntilLibraryGone(opts: {
  kind: "game" | "mod";
  slug: string;
  onGone: () => void;
  timeoutMs?: number;
}): () => void {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let stopped = false;
  let timer: number | undefined;
  let timeoutId: number | undefined;
  let polling = false;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVis);
    if (timer) window.clearInterval(timer);
    if (timeoutId) window.clearTimeout(timeoutId);
  };

  const tick = async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const still = await isStillInstalled(opts.kind, opts.slug);
      if (!still) {
        cleanup();
        opts.onGone();
      }
    } catch {
      /* ignore poll errors */
    } finally {
      polling = false;
    }
  };

  const startPolling = () => {
    if (stopped) return;
    void tick();
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(() => void tick(), POLL_MS);
  };

  const onFocus = () => startPolling();
  const onVis = () => {
    if (document.visibilityState === "visible") startPolling();
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVis);
  timeoutId = window.setTimeout(cleanup, timeoutMs);
  startPolling();

  return cleanup;
}

export function startPcUninstall(opts: {
  kind: "game" | "mod";
  slug: string;
  deepLink: string;
  onGone: () => void;
}): () => void {
  firePlayboundDeepLink(opts.deepLink);
  return watchUntilLibraryGone({
    kind: opts.kind,
    slug: opts.slug,
    onGone: opts.onGone,
  });
}
