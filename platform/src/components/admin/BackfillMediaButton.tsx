"use client";

import { useState } from "react";

export function BackfillMediaButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    if (
      !confirm(
        "Backfill screenshots and videos for games that are light on media? Steam IDs are preferred; websites are used as a fallback. Existing covers are kept."
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/games/media/backfill", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Backfill failed");
      } else {
        const errN = Array.isArray(data?.errors) ? data.errors.length : 0;
        setMessage(
          `Done — updated ${data.updated ?? 0}, skipped ${data.skipped ?? 0}${
            errN ? `, ${errN} error(s)` : ""
          }.`
        );
      }
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
        onClick={run}
        className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/70 disabled:opacity-60"
      >
        {busy ? "Backfilling…" : "Backfill media"}
      </button>
      {message && <p className="max-w-xs text-right text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
