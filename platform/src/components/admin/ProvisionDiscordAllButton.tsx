"use client";

import { useState } from "react";

export function ProvisionDiscordAllButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/community/provision-discord-all", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Provision failed");
      } else {
        const p = Array.isArray(data?.provisioned) ? data.provisioned.length : 0;
        const s = Array.isArray(data?.skipped) ? data.skipped.length : 0;
        const f = Array.isArray(data?.failed) ? data.failed.length : 0;
        setMessage(`Done — created ${p}, linked ${s}, failed ${f}.`);
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
        {busy ? "Provisioning…" : "Provision missing channels"}
      </button>
      {message && <p className="max-w-xs text-right text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
