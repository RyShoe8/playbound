"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function SyncCatalogToDbButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function run() {
    if (!confirm("Synchronize all catalog code facts, editorial, and quality bar ratings into MongoDB?")) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/games/sync", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Sync failed");
      } else {
        setMessage(data?.message ?? "Sync successful!");
        router.refresh();
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
        className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/70 disabled:opacity-60"
      >
        <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Syncing to DB…" : "Sync code to DB"}
      </button>
      {message && <p className="max-w-xs text-right text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
