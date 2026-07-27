"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  KeyRound,
  Link2Off,
  MonitorPlay,
  RefreshCw,
} from "lucide-react";

type Props = {
  /** Server-known token status so Connected UI is correct on first paint. */
  initiallyConnected?: boolean;
  initiallyCreatedAt?: string | null;
};

export function ConnectLauncherPanel({
  initiallyConnected = false,
  initiallyCreatedAt = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState(initiallyConnected);
  const [createdAt, setCreatedAt] = useState<string | null>(initiallyCreatedAt);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/library/token", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { connected: boolean; createdAt: string | null };
      setConnected(data.connected);
      setCreatedAt(data.createdAt);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, router]);

  // After /launcher/auth handoff returns here with ?linked=1
  useEffect(() => {
    if (searchParams.get("linked") !== "1") return;
    void (async () => {
      await refresh();
      router.refresh();
      const next = new URLSearchParams(searchParams.toString());
      next.delete("linked");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    })();
  }, [searchParams, pathname, router, refresh]);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    setManageOpen(true);
    try {
      const res = await fetch("/api/library/token", { method: "POST" });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setError(data.error || "Couldn't generate token");
        return;
      }
      setFreshToken(data.token);
      setConnected(true);
      setCreatedAt(new Date().toISOString());
    } catch {
      setError("Couldn't generate token");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/library/token", { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't disconnect");
        return;
      }
      setConnected(false);
      setCreatedAt(null);
      setFreshToken(null);
      router.refresh();
    } catch {
      setError("Couldn't disconnect");
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function refreshAll() {
    void refresh();
    router.refresh();
  }

  if (connected) {
    return (
      <section className="rounded-xl border border-play/25 bg-play/5 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-play" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Launcher connected</p>
              {createdAt && (
                <p className="text-xs text-muted-foreground">
                  Linked {new Date(createdAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/launcher/auth"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
            >
              <MonitorPlay className="size-3.5" />
              Sync installs
            </Link>
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void revoke()}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              <Link2Off className="size-3.5" />
              Disconnect
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Opens the launcher to re-sync local installs. Then hit Refresh here.
        </p>

        <div className="mt-2">
          <button
            type="button"
            onClick={() => setManageOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`size-3.5 transition-transform ${manageOpen ? "rotate-180" : ""}`} />
            Manage
          </button>
          {manageOpen && (
            <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">
                Regenerate only if the launcher lost its token. This disconnects any previously linked
                launcher until you paste the new token.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generate()}
                className="rounded-full border border-border bg-secondary px-3.5 py-1.5 text-xs font-bold disabled:opacity-60"
              >
                Regenerate token
              </button>
              {freshToken && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-play">Paste into the launcher Advanced field:</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="max-w-full flex-1 overflow-x-auto rounded-lg border border-border bg-secondary/60 px-3 py-2 text-[11px] break-all">
                      {freshToken}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyToken()}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <KeyRound className="size-4 text-primary" />
            Connect launcher
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Optional — link the PlayBound Launcher so installs appear here.
          </p>
        </div>
        <Link
          href="/launcher/auth"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <MonitorPlay className="size-3.5" />
          Connect launcher
        </Link>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setManageOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${manageOpen ? "rotate-180" : ""}`} />
          Advanced — manual token
        </button>

        {manageOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Generate a token and paste it into the launcher if the deep link doesn&apos;t open.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate()}
              className="rounded-full border border-border bg-secondary px-3.5 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Generate token
            </button>

            {freshToken && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-play">Copy this token into the launcher:</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="max-w-full flex-1 overflow-x-auto rounded-lg border border-border bg-secondary/60 px-3 py-2 text-[11px] break-all">
                    {freshToken}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyToken()}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
