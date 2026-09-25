"use client";

import { useCallback, useEffect, useState } from "react";
import type { HostingSettings } from "@/lib/communityHosting/settings";
import type { ProfileSettings } from "@/lib/communityHosting/profileSettings";

type Profile = ProfileSettings & { key: string; gameSlug: string; editionSlug?: string | null; sampleCount?: number; envelope?: { cpuCores?: number; ramBytes?: number; measuredThroughPlayers?: number }; lastSampleAt?: string | null };
type Server = { _id: string; name: string; gameSlug: string; desiredState: string; runtimeState: string; playerCount?: number | null; decisionReason?: string | null };
type Reservation = { sourceKey: string; profileKey: string; state: string; warmupAt: string };
type Data = {
  config: HostingSettings;
  profiles: Profile[];
  servers: Server[];
  reservations: Reservation[];
  titles?: Record<string, string>;
  editionNames?: Record<string, string>;
  metrics: { cpu?: { usagePercent?: number | null }; memory?: { freeBytes?: number }; collectedAt?: string } | null;
  agent: { ok: boolean; error?: string };
};

const GIB = 1024 ** 3;

function usageLabel(p: Profile): string {
  const cores = p.envelope?.cpuCores || 0;
  const gb = (p.envelope?.ramBytes || 0) / GIB;
  if (!cores && !gb) return "not measured";
  return `${cores.toFixed(2)} cores · ${gb.toFixed(2)} GB`;
}

async function saveProfile(p: Profile, change: Partial<ProfileSettings>) {
  const next: ProfileSettings = {
    verification: p.verification, blockedReason: p.blockedReason || null,
    queryKind: p.queryKind, queryVerified: p.queryVerified, joinVerified: p.joinVerified,
    enabled: p.enabled, rotationEligible: p.rotationEligible, weight: 1,
    minimumOnlineMinutes: p.minimumOnlineMinutes ?? null, idleMinutes: p.idleMinutes ?? null,
    cooldownMinutes: p.cooldownMinutes ?? null, ...change,
  };
  const response = await fetch(`/api/admin/connect/game-servers/community-hosting/profile/${encodeURIComponent(p.key)}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not save");
}

/** One row: tick to make this game or edition available for community hosting. */
function ProfileRow({ profile, label, onSaved }: { profile: Profile; label: string; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function toggle(on: boolean) {
    setBusy(true); setStatus("");
    try { await saveProfile(profile, { enabled: on, rotationEligible: on }); await onSaved(); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not save"); }
    finally { setBusy(false); }
  }
  return <label className="flex items-center gap-2 py-0.5">
    <input type="checkbox" checked={profile.enabled} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
    <span>{label}</span>
    <span className="ml-auto text-xs tabular-nums text-muted-foreground">{status || usageLabel(profile)}</span>
  </label>;
}

/** Games as cards with their editions underneath, like the nightly planner. */
function ProfileChecklist({ profiles, titles, editionNames, onSaved }: { profiles: Profile[]; titles: Record<string, string>; editionNames: Record<string, string>; onSaved: () => Promise<void> }) {
  const bySlug = new Map<string, Profile[]>();
  for (const p of profiles) bySlug.set(p.gameSlug, [...(bySlug.get(p.gameSlug) || []), p]);
  const games = [...bySlug.entries()].sort(([a], [b]) => (titles[a] || a).localeCompare(titles[b] || b));
  return <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {games.map(([slug, rows]) => <div key={slug} className="rounded-lg border border-border px-2 py-1.5 text-sm">
      <p className="font-medium">{titles[slug] || slug}</p>
      {[...rows].sort((a, b) => (a.editionSlug ? 1 : 0) - (b.editionSlug ? 1 : 0)).map((p) =>
        <ProfileRow key={p.key} profile={p} label={p.editionSlug ? editionNames[`${slug}:${p.editionSlug}`] || p.editionSlug : "Base game"} onSaved={onSaved} />)}
    </div>)}
  </div>;
}

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
  function numberField(label: string, group: "safety" | "budget" | "monitoring" | "rotation", key: string, opts?: { unit?: string; gb?: boolean; step?: number; help?: string }) {
    if (!config) return null;
    const raw = (config[group] as unknown as Record<string, number>)[key];
    return <label key={`${group}.${key}`} className="block text-sm">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="flex items-center gap-1"><input className="w-24 rounded border bg-background px-2 py-1 text-right" type="number" min="0" step={opts?.step ?? 1} value={opts?.gb ? Number((raw / GIB).toFixed(2)) : raw} onChange={(e) => field(group, key as never, opts?.gb ? Math.round(Number(e.target.value) * GIB) : Number(e.target.value))} />{opts?.unit || ""}</span>
      </span>
      {opts?.help ? <span className="mt-0.5 block text-xs text-muted-foreground">{opts.help}</span> : null}
    </label>;
  }

  /*
   * CPU/RAM warning and critical colours follow the safety maximums rather
   * than being separate decisions: critical = the maximum automatic hosting
   * may reach, warning = 10 points below. Disk has no maximum here, so its
   * two thresholds stay editable under Advanced.
   */
  function withDerivedMonitoring(c: HostingSettings): HostingSettings {
    return {
      ...c,
      monitoring: {
        ...c.monitoring,
        cpuCriticalPercent: c.safety.maxCpuPercent,
        cpuWarningPercent: Math.max(1, c.safety.maxCpuPercent - 10),
        ramCriticalPercent: c.safety.maxRamPercent,
        ramWarningPercent: Math.max(1, c.safety.maxRamPercent - 10),
      },
    };
  }

  async function save() {
    if (!config) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/connect/game-servers/community-hosting", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(withDerivedMonitoring(config)),
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
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3"><h3 className="font-semibold">VPS safety limits</h3>
          <label className="flex items-center justify-between gap-2 text-sm">Region label <input className="w-36 rounded border bg-background px-2 py-1" value={config.node.regionLabel} onChange={(e) => field("node", "regionLabel", e.target.value)} /></label>
          {numberField("Maximum CPU", "safety", "maxCpuPercent", { unit: "%", help: "Don't start an automatic server if the VPS would go above this. Also the red line on the monitoring display (yellow is 10 below)." })}
          {numberField("Maximum RAM", "safety", "maxRamPercent", { unit: "%", help: "Same rule for memory." })}
        </div>
        <div className="space-y-3"><h3 className="font-semibold">Automatic-hosting budget</h3>
          {numberField("CPU", "budget", "cpuCores", { unit: "cores", step: 0.25, help: "Total CPU all automatic servers together may use." })}
          {numberField("RAM", "budget", "ramBytes", { unit: "GB", gb: true, step: 0.25, help: "Total memory all automatic servers together may use." })}
        </div>
        <div className="space-y-3 sm:col-span-2"><h3 className="font-semibold">Rotation</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {numberField("Minimum online", "rotation", "minimumOnlineMinutes", { unit: "min", help: "A started server stays up at least this long." })}
            {numberField("Idle before rotation", "rotation", "idleMinutes", { unit: "min", help: "Empty this long, it can be swapped for another game." })}
            {numberField("Cooldown", "rotation", "cooldownMinutes", { unit: "min", help: "Wait before the same game rotates in again." })}
          </div>
        </div>
      </div>
      <details className="rounded-lg border border-border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-semibold">Advanced</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {numberField("Minimum free RAM", "safety", "minFreeRamBytes", { unit: "GB", gb: true, step: 0.25, help: "Always leave at least this much memory free." })}
          {numberField("Metrics freshness", "safety", "maxMetricsAgeSeconds", { unit: "sec", help: "Refuse to start servers if the VPS reading is older than this. Keep at 900 to match the 15-minute check." })}
          {numberField("Disk warning", "monitoring", "diskWarningPercent", { unit: "%" })}
          {numberField("Disk critical", "monitoring", "diskCriticalPercent", { unit: "%" })}
        </div>
      </details>
      <p className="text-xs text-muted-foreground">Current VPS: CPU {data?.metrics?.cpu?.usagePercent ?? "unknown"}% · free RAM {data?.metrics?.memory?.freeBytes ? (data.metrics.memory.freeBytes / GIB).toFixed(1) : "unknown"} GB · metrics {data?.metrics?.collectedAt || "unavailable"}. Agent: {data?.agent.ok ? "reachable" : data?.agent.error || "unavailable"}.</p>
      <button type="button" disabled={saving} onClick={save} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save hosting settings</button>
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div><h3 className="font-semibold">Games for automatic hosting</h3><p className="text-xs text-muted-foreground">Tick the games and editions available for community hosting. Usage is measured CPU and RAM per server.</p>
      <div className="text-sm">{data?.profiles.length ? <ProfileChecklist profiles={data.profiles} titles={data.titles || {}} editionNames={data.editionNames || {}} onSaved={load} /> : <p className="text-muted-foreground">No games measured yet.</p>}</div>
    </div>
    <div><h3 className="font-semibold">Running and queued servers</h3><div className="mt-2 space-y-1 text-sm">{data?.servers.length ? data.servers.map((s) => <div key={s._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1"><span>{s.name} · {s.gameSlug}</span><span>{s.runtimeState} · {s.playerCount ?? "players unknown"} · {s.decisionReason || "—"}</span><span className="flex gap-2"><button type="button" className="underline" onClick={() => void serverAction(s, "start")}>Start</button><button type="button" className="underline" onClick={() => void serverAction(s, "restart")}>Restart</button><button type="button" className="underline" onClick={() => void serverAction(s, "stop")}>Stop</button></span></div>) : <p className="text-muted-foreground">No managed servers.</p>}</div></div>
    <div><h3 className="font-semibold">Upcoming capacity reservations</h3><div className="mt-2 space-y-1 text-sm">{data?.reservations.length ? data.reservations.map((r) => <p key={r.sourceKey}>{r.profileKey} · {r.state} · warmup {new Date(r.warmupAt).toLocaleString()}</p>) : <p className="text-muted-foreground">No reservations.</p>}</div></div>
  </section>;
}
