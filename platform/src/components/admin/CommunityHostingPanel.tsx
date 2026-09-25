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
  metrics: { cpu?: { usagePercent?: number | null }; memory?: { freeBytes?: number }; collectedAt?: string } | null;
  agent: { ok: boolean; error?: string };
};

const GIB = 1024 ** 3;

function ProfileEditor({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ProfileSettings>({
    verification: profile.verification, blockedReason: profile.blockedReason || null,
    queryKind: profile.queryKind, queryVerified: profile.queryVerified,
    joinVerified: profile.joinVerified, enabled: profile.enabled,
    rotationEligible: profile.rotationEligible, weight: profile.weight,
    minimumOnlineMinutes: profile.minimumOnlineMinutes ?? null,
    idleMinutes: profile.idleMinutes ?? null, cooldownMinutes: profile.cooldownMinutes ?? null,
  });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  function set<K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) {
    setDraft((old) => ({ ...old, [key]: value }));
  }
  async function save() {
    setSaving(true); setStatus("");
    try {
      const response = await fetch(`/api/admin/connect/game-servers/community-hosting/profile/${encodeURIComponent(profile.key)}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save profile");
      setStatus("Saved");
      await onSaved();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save profile"); }
    finally { setSaving(false); }
  }
  return <details className="border-b border-border py-2">
    <summary className="cursor-pointer text-sm"><strong>{profile.gameSlug}{profile.editionSlug ? ` · ${profile.editionSlug}` : ""}</strong> · {profile.verification} · {profile.sampleCount || 0} samples · {profile.envelope?.cpuCores || 0} cores / {((profile.envelope?.ramBytes || 0) / GIB).toFixed(2)} GB{profile.blockedReason ? ` · ${profile.blockedReason}` : ""}</summary>
    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      <label>Verification <select className="ml-2 rounded border bg-background p-1" value={draft.verification} onChange={(e) => set("verification", e.target.value as ProfileSettings["verification"])}><option value="testing">Testing</option><option value="blocked">Blocked</option><option value="verified">Verified</option></select></label>
      <label>Player query <select className="ml-2 rounded border bg-background p-1" value={draft.queryKind} onChange={(e) => set("queryKind", e.target.value as ProfileSettings["queryKind"])}><option value="none">Not available</option><option value="openra-master">OpenRA master</option></select></label>
      <label><input type="checkbox" checked={draft.queryVerified} onChange={(e) => set("queryVerified", e.target.checked)} /> Player query tested</label>
      <label><input type="checkbox" checked={draft.joinVerified} onChange={(e) => set("joinVerified", e.target.checked)} /> Client Join tested</label>
      <label><input type="checkbox" checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Enable profile</label>
      <label><input type="checkbox" checked={draft.rotationEligible} onChange={(e) => set("rotationEligible", e.target.checked)} /> Allow rotation</label>
      <label>Rotation weight <input className="ml-2 w-16 rounded border bg-background p-1" type="number" min="1" max="100" value={draft.weight} onChange={(e) => set("weight", Number(e.target.value))} /></label>
      <label>Blocked reason <input className="ml-2 w-full rounded border bg-background p-1" value={draft.blockedReason || ""} onChange={(e) => set("blockedReason", e.target.value || null)} /></label>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Verified rotation requires a tested query, client Join, and idle plus occupied CPU/RAM samples. Highest observed player count: {profile.envelope?.measuredThroughPlayers || 0}. Last sample: {profile.lastSampleAt ? new Date(profile.lastSampleAt).toLocaleString() : "none"}.</p>
    <div className="mt-2 flex items-center gap-3"><button type="button" disabled={saving} onClick={() => void save()} className="rounded-full border px-3 py-1 disabled:opacity-50">Save profile</button>{status && <span role="status">{status}</span>}</div>
  </details>;
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
    <div><h3 className="font-semibold">Dedicated-server audit</h3><p className="text-xs text-muted-foreground">Only verified profiles with a tested query and Join path can enter automatic rotation.</p>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">{data?.profiles.length ? data.profiles.map((p) => <ProfileEditor key={p.key} profile={p} onSaved={load} />) : <p className="text-muted-foreground">No profiles measured yet.</p>}</div>
    </div>
    <div><h3 className="font-semibold">Running and queued servers</h3><div className="mt-2 space-y-1 text-sm">{data?.servers.length ? data.servers.map((s) => <div key={s._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1"><span>{s.name} · {s.gameSlug}</span><span>{s.runtimeState} · {s.playerCount ?? "players unknown"} · {s.decisionReason || "—"}</span><span className="flex gap-2"><button type="button" className="underline" onClick={() => void serverAction(s, "start")}>Start</button><button type="button" className="underline" onClick={() => void serverAction(s, "restart")}>Restart</button><button type="button" className="underline" onClick={() => void serverAction(s, "stop")}>Stop</button></span></div>) : <p className="text-muted-foreground">No managed servers.</p>}</div></div>
    <div><h3 className="font-semibold">Upcoming capacity reservations</h3><div className="mt-2 space-y-1 text-sm">{data?.reservations.length ? data.reservations.map((r) => <p key={r.sourceKey}>{r.profileKey} · {r.state} · warmup {new Date(r.warmupAt).toLocaleString()}</p>) : <p className="text-muted-foreground">No reservations.</p>}</div></div>
  </section>;
}
