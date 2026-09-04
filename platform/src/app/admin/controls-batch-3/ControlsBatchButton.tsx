"use client";

import { useState } from "react";

export function ControlsBatchButton() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true);
    setStatus("Applying validated controls…");
    try {
      const response = await fetch("/api/admin/controls/batch-3", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setStatus(`Complete: controls added to ${body.updated} games.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return <div className="space-y-3"><button type="button" onClick={apply} disabled={busy} className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Applying…" : "Apply controls batch 3"}</button><p role="status" className="text-sm">{status}</p></div>;
}
