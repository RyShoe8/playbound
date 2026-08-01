"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function VersionIssueRecheck({
  kind,
  slug,
}: {
  kind: "game" | "mod";
  slug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function recheck() {
    setBusy(true);
    setMessage("");
    try {
      const path =
        kind === "game"
          ? `/api/admin/games/${encodeURIComponent(slug)}/check-version`
          : `/api/admin/mods/${encodeURIComponent(slug)}/check-version`;
      const res = await fetch(path, { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        result?: { status?: string; note?: string };
      } | null;
      if (!res.ok) {
        setMessage(data?.error || "Re-check failed");
        setBusy(false);
        return;
      }
      const status = data?.result?.status || "done";
      const note = data?.result?.note ? ` — ${data.result.note}` : "";
      setMessage(`${status}${note}`);
      router.refresh();
    } catch {
      setMessage("Couldn't reach the server.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void recheck()}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold transition-colors hover:bg-secondary/70 disabled:opacity-60"
      >
        <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Checking…" : "Re-check"}
      </button>
      {message ? <p className="max-w-[220px] text-right text-[11px] text-muted-foreground">{message}</p> : null}
    </div>
  );
}
