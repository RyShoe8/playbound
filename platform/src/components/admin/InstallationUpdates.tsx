"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstallationCoverageRow, InstallationUpdateAction, InstallationUpdateSnapshot } from "@/lib/gameHost/installationTypes";

const ENDPOINT = "/api/admin/connect/game-servers/updates";
const FINISHED = new Set(["completed", "failed", "cancelled"]);
const CATEGORY = { "os-package": "OS packages", archive: "Archive / image", "custom-build": "Custom build", "private-runtime": "Private runtime", edition: "Edition", review: "Review needed", supported: "Handler available" };

export default function InstallationUpdates() {
  const [data, setData] = useState<(InstallationUpdateSnapshot & { canWrite: boolean; coverage?: InstallationCoverageRow[] }) | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load updates");
    setData(result);
    setMessage("");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load().catch((error) => setMessage(error.message)), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const hasActive = data?.jobs.some((job) => !FINISHED.has(job.status));
  const gaps = data?.coverage?.filter((entry) => entry.category !== "supported") || [];
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
    <p className="text-xs text-muted-foreground">Actions update the named installation. Separate edition and mod packages may still need their own handler; see Update coverage below. Retained and partial copies consume disk space; insufficient space blocks the update.</p>
    {data?.daily && <div className="rounded-lg border p-3 text-sm">
      <p className="font-medium">Daily release checks enabled</p>
      <p className="text-xs text-muted-foreground">{data.daily.completedAt ? `Last completed ${new Date(data.daily.completedAt).toLocaleString()}. ` : "First check is running. "}Next check {new Date(data.daily.nextCheckAt).toLocaleString()}. New supported builds are queued automatically; running games are never interrupted. Pinned/custom builds require review.</p>
      {data.daily.message && <p className="text-xs text-muted-foreground">{data.daily.message}</p>}
    </div>}
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    {!data && !message && <p className="text-sm">Loading installations…</p>}
    {data?.targets.map((target) => {
      const active = data.jobs.find((job) => job.key === target.key && !FINISHED.has(job.status));
      const daily = data.daily?.targets[target.key];
      const dailyJob = daily?.status === "queued" ? data.jobs.find((job) => job.id === daily.jobId) : undefined;
      return <div key={target.key} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
        <div className="min-w-0"><p className="font-medium">{target.name}</p><p className="text-xs text-muted-foreground">{target.installed ? `Installed build ${target.buildId}` : "Installation missing or incomplete"}{active ? ` · ${active.status}` : ""}</p>{target.blockedReason && <p className="max-w-xl text-xs text-muted-foreground">{target.blockedReason}</p>}
          {target.updateLimitation && <p className="max-w-xl text-xs text-muted-foreground">{target.updateLimitation}</p>}
          {target.hostingReadiness && <details className="mt-2 max-w-xl text-xs text-muted-foreground">
            <summary className="cursor-pointer">Customer isolation and content support</summary>
            <p className="mt-1">{target.hostingReadiness.reason}</p>
            <p className="mt-1">{target.hostingReadiness.contentReason}</p>
          </details>}
          {daily && <p className="max-w-xl text-xs text-muted-foreground">Daily check: {dailyJob ? `update ${dailyJob.status}` : daily.status.replaceAll("_", " ")}{daily.availableBuild ? ` · latest ${daily.availableBuild}` : ""}. {dailyJob?.message || daily.message}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={busy || !data.canWrite || !target.installed || Boolean(active) || Boolean(target.blockedReason)} onClick={() => void act("update", target.key, target.name)}>Queue update</button>
          {target.rollbackAvailable && <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={busy || !data.canWrite || Boolean(active) || Boolean(target.blockedReason)} onClick={() => void act("rollback", target.key, target.name)}>Roll back</button>}
          {active?.status === "waiting" && <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={busy || !data.canWrite} onClick={() => void act("cancel", active.id, target.name)}>Cancel update</button>}
        </div>
      </div>;
    })}
    {data?.coverage && <details className="min-w-0 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Update coverage · {data.coverage.filter((entry) => entry.category === "supported").length} families with handlers · {gaps.length} remaining games / editions</summary>
      <p className="mt-2 text-xs text-muted-foreground">This covers dedicated recipes, including paid/party-only games and separate edition packages. It does not enable hosting or change the catalog. Games below have no update action until their handler is ready.</p>
      <ul className="mt-3 space-y-2">{gaps.map((entry) => <li key={entry.id} className="min-w-0 rounded-lg bg-muted/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{entry.name}</p><span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">{CATEGORY[entry.category]}</span></div>
        <p className="mt-1 break-words text-xs text-muted-foreground">{entry.reason}</p>
      </li>)}</ul>
    </details>}
    {data && data.jobs.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Update activity</summary>
      <div className="mt-3 space-y-2">{data.jobs.map((job) => <div key={job.id} className="min-w-0 rounded border p-3 text-sm">
        <p className="font-medium">{data.targets.find((target) => target.key === job.key)?.name || job.key} · {job.action} · {job.status}</p>
        <p className="break-words text-muted-foreground">{job.message || "Waiting for the VPS scheduler"}</p>
        <p className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString()} · Build {job.beforeBuild}{job.afterBuild ? ` → ${job.afterBuild}` : ""}</p>
      </div>)}</div>
    </details>}
  </section>;
}
