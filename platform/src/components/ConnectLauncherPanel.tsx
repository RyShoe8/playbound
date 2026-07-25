"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Copy, KeyRound, Link2Off, MonitorPlay } from "lucide-react";
import { launcherAuthUrl } from "@/lib/launcher";

export function ConnectLauncherPanel() {
  const [connected, setConnected] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    setAdvancedOpen(true);
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
        setError("Couldn't revoke token");
        return;
      }
      setConnected(false);
      setCreatedAt(null);
      setFreshToken(null);
    } catch {
      setError("Couldn't revoke token");
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

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <KeyRound className="size-4 text-primary" />
            Connect launcher
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Optional — sign in through the launcher to sync installs to this library. You can still
            install games without an account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={launcherAuthUrl()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
          >
            <MonitorPlay className="size-3.5" />
            Connect in launcher
          </a>
          {connected && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void revoke()}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3.5 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              <Link2Off className="size-3.5" />
              Revoke
            </button>
          )}
        </div>
      </div>

      {connected && (
        <p className="mt-3 text-xs text-muted-foreground">
          A launcher token is active on your account
          {createdAt ? ` · created ${new Date(createdAt).toLocaleString()}` : ""}.
        </p>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          Advanced — manual token
        </button>

        {advancedOpen && (
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
              {connected ? "Regenerate token" : "Generate token"}
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
