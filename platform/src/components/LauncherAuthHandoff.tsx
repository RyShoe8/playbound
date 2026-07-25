"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { launcherLinkUrl } from "@/lib/launcher";

type Props = {
  token: string;
  username: string;
};

const HANDOFF_DELAY_MS = 1800;

export function LauncherAuthHandoff({ token, username }: Props) {
  const [copied, setCopied] = useState(false);
  const linkUrl = launcherLinkUrl(token);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Trigger protocol without navigating this tab away
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
  }, [linkUrl]);

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <KeyRound className="size-10 text-primary" />
      <h1 className="text-2xl font-extrabold">Connected as {username}</h1>
      <p className="text-sm text-muted-foreground">
        Opening the PlayBound Launcher to sync your installs. You&apos;ll return to your library in a
        moment — close the launcher when it says Connected.
      </p>
      <a
        href={linkUrl}
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
      >
        Open launcher again
      </a>
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
