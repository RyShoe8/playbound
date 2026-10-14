"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstallationUpdateAction, InstallationUpdateSnapshot } from "@/lib/gameHost/installationTypes";

const ENDPOINT = "/api/admin/connect/game-servers/updates";
const FINISHED = new Set(["completed", "failed", "cancelled"]);

export default function InstallationUpdates() {
  const [data, setData] = useState<(InstallationUpdateSnapshot & { canWrite: boolean }) | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load updates");
    setData(result);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load().catch((error) => setMessage(error.message)), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const hasActive = data?.jobs.some((job) => !FINISHED.has(job.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => void load().catch((error) => setMessage(error.message)), 15_000);
    return () => clearInterval(timer);
  }, [hasActive, load]);

  async function act(action: InstallationUpdateAction, target: string, name: string) {
    if (action !== "cancel" && !window.confirm(`Queue ${action} for ${name}? All servers sharing this installation must be stopped before it runs. Existing games will keep running; new starts will pause.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "cancel" ? { action, id: target } : { action, key: target }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not queue update");
      setData(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Update unavailable"); }
    finally { setBusy(false); }
  }

  return <section className="min-w-0 space-y-3 rounded-xl border border-border p-4" aria-label="Shared installation updates">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Shared installation updates</h3>
      <button type="button" disabled={busy} className="rounded border px-3 py-1 text-sm disabled:opacity-50" onClick={() => void load().catch((error) => setMessage(error.message))}>Refresh updates</button>
    </div>
    <p className="text-sm text-muted-foreground">Queue an update, then stop affected servers when players are finished. Updates wait for every affected party and hosted server to stop. They run on the VPS, preserve saves, and retain the previous installation for rollback. Servers are not automatically restarted.</p>
    <p className="text-xs text-muted-foreground">Supported installations appear below, including editions sharing their files. Other game installations are not changed. Retained and partial copies consume disk space; insufficient space blocks the update.</p>
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    {!data && !message && <p className="text-sm">Loading installations…</p>}
    {data?.targets.map((target) => {
      const active = data.jobs.find((job) => job.key === target.key && !FINISHED.has(job.status));
      return <div key={target.key} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
        <div className="min-w-0"><p className="font-medium">{target.name}</p><p className="text-xs text-muted-foreground">{target.installed ? `Installed build ${target.buildId}` : "Installation missing or incomplete"}{active ? ` · ${active.status}` : ""}</p>{target.blockedReason && <p className="max-w-xl text-xs text-muted-foreground">{target.blockedReason}</p>}</div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={busy || !data.canWrite || !target.installed || Boolean(active) || Boolean(target.blockedReason)} onClick={() => void act("update", target.key, target.name)}>Queue update</button>
          {target.rollbackAvailable && <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={busy || !data.canWrite || Boolean(active) || Boolean(target.blockedReason)} onClick={() => void act("rollback", target.key, target.name)}>Roll back</button>}
          {active?.status === "waiting" && <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={busy || !data.canWrite} onClick={() => void act("cancel", active.id, target.name)}>Cancel update</button>}
        </div>
      </div>;
    })}
    {data && data.jobs.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Update activity</summary>
      <div className="mt-3 space-y-2">{data.jobs.map((job) => <div key={job.id} className="min-w-0 rounded border p-3 text-sm">
        <p className="font-medium">{data.targets.find((target) => target.key === job.key)?.name || job.key} · {job.action} · {job.status}</p>
        <p className="break-words text-muted-foreground">{job.message || "Waiting for the VPS scheduler"}</p>
        <p className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString()} · Build {job.beforeBuild}{job.afterBuild ? ` → ${job.afterBuild}` : ""}</p>
      </div>)}</div>
    </details>}
  </section>;
}
