"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Link2Off } from "lucide-react";

export function ConnectLauncherPanel() {
  const [connected, setConnected] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            Generate a token, paste it into the PlayBound Launcher, and installs sync to this library.
            The token is shown once — store it safely.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {connected ? "Regenerate token" : "Generate token"}
          </button>
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

      {connected && !freshToken && (
        <p className="mt-3 text-xs text-muted-foreground">
          Launcher connected
          {createdAt ? ` · token created ${new Date(createdAt).toLocaleString()}` : ""}. Regenerate
          if you lost the token.
        </p>
      )}

      {freshToken && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-play">Copy this token into the launcher now:</p>
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

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
