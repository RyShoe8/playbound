"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, MonitorPlay } from "lucide-react";
import { launcherLinkUrl } from "@/lib/launcher";

type Props = {
  username: string;
};

const HANDOFF_DELAY_MS = 2500;

export function LauncherAuthHandoff({ username }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const linkUrl = token ? launcherLinkUrl(token) : null;

  useEffect(() => {
    if (!token || !linkUrl || started.current) return;
    started.current = true;

    const a = document.createElement("a");
    a.href = linkUrl;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();

    const t = window.setTimeout(() => {
      window.location.assign("/library?linked=1");
    }, HANDOFF_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [token, linkUrl]);

  async function connect() {
    setBusy(true);
    setError(null);
    started.current = false;
    try {
      const res = await fetch("/api/library/token", { method: "POST" });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setError(data.error || "Couldn't mint launcher token");
        return;
      }
      setToken(data.token);
    } catch {
      setError("Couldn't mint launcher token");
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <KeyRound className="size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Connect as {username}</h1>
        <p className="text-sm text-muted-foreground">
          Use this for first connect or reconnect. Clicking Connect creates a new link and disconnects
          any previously linked launcher until you finish handing it off. Visiting this page alone does
          not change your existing connection. To push installs without reminting, use Sync installs on
          your library page.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void connect()}
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          <MonitorPlay className="size-4" />
          {busy ? "Connecting…" : "Connect launcher"}
        </button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <KeyRound className="size-10 text-primary" />
      <h1 className="text-2xl font-extrabold">Connected as {username}</h1>
      <p className="text-sm text-muted-foreground">
        Opening the PlayBound Launcher to sync your installs. You&apos;ll return to your library in a
        moment — close the launcher when it says Connected. If the library looks empty, open the
        launcher and wait for sync, then refresh.
      </p>
      {linkUrl && (
        <a
          href={linkUrl}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
        >
          Open launcher again
        </a>
      )}
      <a href="/library?linked=1" className="text-sm font-semibold text-primary hover:underline">
        Go to library now
      </a>
      <div className="mt-2 w-full space-y-2 text-left">
        <p className="text-xs font-semibold text-muted-foreground">
          If nothing opens, copy this token into the launcher&apos;s Advanced field:
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="max-w-full flex-1 overflow-x-auto rounded-lg border border-border bg-secondary/60 px-3 py-2 text-[11px] break-all">
            {token}
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
    </div>
  );
}
