"use client";

import { useCallback, useEffect, useState } from "react";
import type { HostingSettings } from "@/lib/communityHosting/settings";

type Profile = { key: string; gameSlug: string; editionSlug?: string | null; verification: string; blockedReason?: string | null; sampleCount?: number; envelope?: { cpuCores?: number; ramBytes?: number; measuredThroughPlayers?: number }; enabled?: boolean };
type Server = { _id: string; name: string; gameSlug: string; desiredState: string; runtimeState: string; playerCount?: number | null; decisionReason?: string | null };
type Reservation = { sourceKey: string; profileKey: string; state: string; warmupAt: string };
type Data = {
  config: HostingSettings;
  profiles: Profile[];
  servers: Server[];
  reservations: Reservation[];
  metrics: { cpu?: { usagePercent?: number | null }; memory?: { freeBytes?: number }; collectedAt?: string } | null;
  agent: { ok: boolean; error?: string };
};

const GIB = 1024 ** 3;

export function CommunityHostingPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [config, setConfig] = useState<HostingSettings | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/connect/game-servers/community-hosting");
    if (!response.ok) throw new Error("Could not load Community Hosting settings");
    const next = await response.json() as Data;
    setData(next);
    setConfig(next.config);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load().catch((error) => setMessage(error.message)), 0);
    return () => clearTimeout(timer);
  }, [load]);

  function section<K extends keyof HostingSettings>(key: K, value: HostingSettings[K]) {
    setConfig((current) => current ? { ...current, [key]: value } : current);
  }
  function field<K extends "safety" | "budget" | "monitoring" | "rotation" | "node">(group: K, key: keyof HostingSettings[K], value: number | string | boolean) {
    setConfig((current) => current ? { ...current, [group]: { ...current[group], [key]: value } } : current);
  }
  function numberField(label: string, group: "safety" | "budget" | "monitoring" | "rotation", key: string, opts?: { unit?: string; gb?: boolean; step?: number }) {
    if (!config) return null;
    const raw = (config[group] as unknown as Record<string, number>)[key];
    return <label key={`${group}.${key}`} className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1"><input className="w-24 rounded border bg-background px-2 py-1 text-right" type="number" min="0" step={opts?.step ?? 1} value={opts?.gb ? Number((raw / GIB).toFixed(2)) : raw} onChange={(e) => field(group, key as never, opts?.gb ? Math.round(Number(e.target.value) * GIB) : Number(e.target.value))} />{opts?.unit || ""}</span>
    </label>;
  }

  async function save() {
    if (!config) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/connect/game-servers/community-hosting", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(config),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save hosting settings");
      setConfig(body.config); setMessage("Hosting settings saved; the next reconciliation will use them.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save hosting settings"); }
    finally { setSaving(false); }
  }

  async function serverAction(server: Server, action: "start" | "stop" | "restart") {
    const force = action !== "start" && (server.playerCount === null || (server.playerCount ?? 0) > 0);
    if (force && !window.confirm(`${server.name}: the player count is ${server.playerCount === null ? "unknown" : server.playerCount}. ${action} may disconnect players. Continue?`)) return;
    setMessage("");
    try {
      const response = await fetch(`/api/admin/connect/game-servers/community-hosting/${encodeURIComponent(server._id)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, force }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Could not ${action} server`);
      setMessage(`${server.name}: ${body.state?.status || action}`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : `Could not ${action} server`); }
  }

  return <section className="space-y-4 rounded-xl border border-border bg-card p-5" aria-label="Community Hosting">
    <div><h2 className="text-lg font-semibold">Community Hosting</h2><p className="text-sm text-muted-foreground">Automatic hosting is off until the node and verified game profiles are ready. Changes here do not edit the game catalog.</p></div>
    {config && <>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={config.enabled} onChange={(e) => section("enabled", e.target.checked)} />Enable automatic hosting</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={config.node.enabled} onChange={(e) => field("node", "enabled", e.target.checked)} />Node enabled</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={config.node.draining} onChange={(e) => field("node", "draining", e.target.checked)} />Drain node</label>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2"><h3 className="font-semibold">Node and safety</h3>
          <label className="flex items-center justify-between gap-2 text-sm">Region label <input className="w-36 rounded border bg-background px-2 py-1" value={config.node.regionLabel} onChange={(e) => field("node", "regionLabel", e.target.value)} /></label>
          {numberField("Maximum CPU", "safety", "maxCpuPercent", { unit: "%" })}
          {numberField("Maximum RAM", "safety", "maxRamPercent", { unit: "%" })}
          {numberField("Minimum free RAM", "safety", "minFreeRamBytes", { unit: "GB", gb: true, step: 0.25 })}
          {numberField("Metrics freshness", "safety", "maxMetricsAgeSeconds", { unit: "sec" })}
        </div>
        <div className="space-y-2"><h3 className="font-semibold">Automatic-hosting budget</h3>
          {numberField("CPU", "budget", "cpuCores", { unit: "cores", step: 0.25 })}
          {numberField("RAM", "budget", "ramBytes", { unit: "GB", gb: true, step: 0.25 })}
          <h3 className="pt-2 font-semibold">Rotation</h3>
          {numberField("Minimum online", "rotation", "minimumOnlineMinutes", { unit: "min" })}
          {numberField("Idle before rotation", "rotation", "idleMinutes", { unit: "min" })}
          {numberField("Cooldown", "rotation", "cooldownMinutes", { unit: "min" })}
        </div>
        <div className="space-y-2"><h3 className="font-semibold">Monitoring thresholds</h3>
          {numberField("CPU warning", "monitoring", "cpuWarningPercent", { unit: "%" })}
          {numberField("CPU critical", "monitoring", "cpuCriticalPercent", { unit: "%" })}
          {numberField("RAM warning", "monitoring", "ramWarningPercent", { unit: "%" })}
          {numberField("RAM critical", "monitoring", "ramCriticalPercent", { unit: "%" })}
          {numberField("Disk warning", "monitoring", "diskWarningPercent", { unit: "%" })}
          {numberField("Disk critical", "monitoring", "diskCriticalPercent", { unit: "%" })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Current VPS: CPU {data?.metrics?.cpu?.usagePercent ?? "unknown"}% · free RAM {data?.metrics?.memory?.freeBytes ? (data.metrics.memory.freeBytes / GIB).toFixed(1) : "unknown"} GB · metrics {data?.metrics?.collectedAt || "unavailable"}. Agent: {data?.agent.ok ? "reachable" : data?.agent.error || "unavailable"}.</p>
      <button type="button" disabled={saving} onClick={save} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save hosting settings</button>
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div><h3 className="font-semibold">Dedicated-server audit</h3><p className="text-xs text-muted-foreground">Only verified profiles with a tested query and Join path can enter automatic rotation.</p>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">{data?.profiles.length ? data.profiles.map((p) => <div key={p.key} className="flex flex-wrap justify-between gap-2 border-b border-border py-1"><span>{p.gameSlug}{p.editionSlug ? ` · ${p.editionSlug}` : ""}</span><span>{p.verification}{p.blockedReason ? ` · ${p.blockedReason}` : ""} · {p.sampleCount || 0} samples · {p.envelope?.cpuCores || 0} cores / {((p.envelope?.ramBytes || 0) / GIB).toFixed(2)} GB</span></div>) : <p className="text-muted-foreground">No profiles measured yet.</p>}</div>
    </div>
    <div><h3 className="font-semibold">Running and queued servers</h3><div className="mt-2 space-y-1 text-sm">{data?.servers.length ? data.servers.map((s) => <div key={s._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1"><span>{s.name} · {s.gameSlug}</span><span>{s.runtimeState} · {s.playerCount ?? "players unknown"} · {s.decisionReason || "—"}</span><span className="flex gap-2"><button type="button" className="underline" onClick={() => void serverAction(s, "start")}>Start</button><button type="button" className="underline" onClick={() => void serverAction(s, "restart")}>Restart</button><button type="button" className="underline" onClick={() => void serverAction(s, "stop")}>Stop</button></span></div>) : <p className="text-muted-foreground">No managed servers.</p>}</div></div>
    <div><h3 className="font-semibold">Upcoming capacity reservations</h3><div className="mt-2 space-y-1 text-sm">{data?.reservations.length ? data.reservations.map((r) => <p key={r.sourceKey}>{r.profileKey} · {r.state} · warmup {new Date(r.warmupAt).toLocaleString()}</p>) : <p className="text-muted-foreground">No reservations.</p>}</div></div>
  </section>;
}
