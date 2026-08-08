"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, MonitorPlay } from "lucide-react";
import { launcherLinkUrl } from "@/lib/launcher";

type Props = {
  username: string;
  /** When opened from the Electron auth window, mint + hand off immediately. */
  autoConnect?: boolean;
};

const HANDOFF_DELAY_MS = 2500;

export function LauncherAuthHandoff({ username, autoConnect = false }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const autoStarted = useRef(false);

  const linkUrl = code ? launcherLinkUrl(code) : null;

  useEffect(() => {
    if (!code || !linkUrl || started.current) return;
    started.current = true;

    const a = document.createElement("a");
    a.href = linkUrl;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Browser handoff returns to library; in-app auth window closes on link intercept.
    if (!autoConnect) {
      const t = window.setTimeout(() => {
        window.location.assign("/library?linked=1");
      }, HANDOFF_DELAY_MS);
      return () => window.clearTimeout(t);
    }
  }, [code, linkUrl, autoConnect]);

  async function connect() {
    setBusy(true);
    setError(null);
    started.current = false;
    try {
      const res = await fetch("/api/library/handoff", { method: "POST" });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !data.code) {
        setError(data.error || "Couldn't start launcher connect");
        return;
      }
      setCode(data.code);
    } catch {
      setError("Couldn't start launcher connect");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoConnect || autoStarted.current) return;
    autoStarted.current = true;
    void connect();
    // Runs once on mount when from=app; connect() is stable for this purpose.
  }, [autoConnect]);

  if (!code) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <KeyRound className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">
          {autoConnect ? `Signing in as ${username}` : `Connect as ${username}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {autoConnect
            ? "Linking this account to the PlayBound app…"
            : "Use this for first connect or reconnect. Clicking Connect creates a new link and disconnects any previously linked launcher until you finish handing it off."}
        </p>
        {!autoConnect && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void connect()}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            <MonitorPlay className="size-4" />
            {busy ? "Connecting…" : "Connect launcher"}
          </button>
        )}
        {autoConnect && busy && <p className="text-sm text-muted-foreground">Connecting…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <KeyRound className="size-10 text-primary" />
      <h1 className="text-2xl font-extrabold">Connected as {username}</h1>
      <p className="text-sm text-muted-foreground">
        {autoConnect
          ? "Handing off to the PlayBound app. This window can close once the app says you are signed in."
          : "Opening the PlayBound Launcher to sync your installs. You'll return to your library in a moment."}
      </p>
      {linkUrl && (
        <a
          href={linkUrl}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
        >
          Open launcher again
        </a>
      )}
      {!autoConnect && (
        <a href="/library?linked=1" className="text-sm font-semibold text-primary hover:underline">
          Go to library now
        </a>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        If nothing opens, use Sign in from the launcher Settings window instead.
      </p>
    </div>
  );
}
