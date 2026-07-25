"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

type Props = {
  token: string;
  username: string;
};

export function LauncherAuthHandoff({ token, username }: Props) {
  const [copied, setCopied] = useState(false);
  const linkUrl = `playbound://link?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    // Hand off to the desktop launcher; copy UI remains as fallback.
    window.location.href = linkUrl;
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
        Handing off to the PlayBound Launcher. You can close this window once the launcher shows
        Connected.
      </p>
      <a
        href={linkUrl}
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
      >
        Open launcher
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
