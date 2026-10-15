"use client";

import { useEffect, useState } from "react";
import type { ManagedLogSnapshot } from "@/lib/gameHost/client";

export function ServerLogs({ base }: { base: string }) {
  const [snapshot, setSnapshot] = useState<ManagedLogSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [follow, setFollow] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (document.hidden) { setBusy(false); return; }
      try {
        const response = await fetch(`${base}/logs`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load server output.");
        if (!controller.signal.aborted) { setSnapshot(data); setError(""); }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : "Could not load server output.");
          setFollow(false); // Errors, including revoked access, never cause a retry storm.
          return;
        }
      } finally { if (!controller.signal.aborted) setBusy(false); }
      if (follow && !controller.signal.aborted && !document.hidden) timer = setTimeout(() => void load(), 5000);
    }
    const visible = () => {
      clearTimeout(timer);
      // Restart through the effect to cancel any pending request as well.
      setRefresh(value => value + 1);
    };
    document.addEventListener("visibilitychange", visible);
    void load();
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [base, refresh, follow]);
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Latest captured server output, up to 200 lines. Credential-bearing lines are omitted. Live output refreshes every five seconds while this tab is visible.</p>
      <button type="button" aria-pressed={follow} onClick={() => setFollow(value => !value)} className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm">{follow ? "Pause live output" : "Follow live output"}</button>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); setError(""); setRefresh((value) => value + 1); }} className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{busy ? "Loading…" : "Refresh output"}</button>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {!error && snapshot ? snapshot.available ? <>
      {snapshot.truncated ? <p className="text-xs text-muted-foreground">Showing the newest portion of the log.</p> : null}
      <pre aria-label="Server output" className="max-h-96 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border bg-black/80 p-3 font-mono text-xs text-zinc-100">{snapshot.lines.join("\n") || "No complete output lines yet."}</pre>
    </> : <p className="text-sm text-muted-foreground">No captured output is available for this server yet. Some engines use a separate console transport.</p> : null}
  </div>;
}
