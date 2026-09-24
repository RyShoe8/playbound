"use client";

import { useEffect, useState } from "react";
import type { NightlyScheduleConfig } from "@/lib/models/AutomatedEventConfig";

type Candidate = { slug: string; title: string; editions: { slug: string; name: string }[] };

export function NightlyPlannerPanel() {
  const [config, setConfig] = useState<NightlyScheduleConfig | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [legacyEnabled, setLegacyEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/events/nightly")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load nightly schedule")))
      .then((data) => {
        setConfig(data.nightly);
        setCandidates(data.candidates);
        setLegacyEnabled(data.legacyPopupEnabled);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  function patch(p: Partial<NightlyScheduleConfig>) {
    setConfig((current) => current ? { ...current, ...p } : current);
  }

  function toggle(slug: string, enabled: boolean) {
    if (!config) return;
    const existing = config.games.find((g) => g.slug === slug);
    const games = existing
      ? config.games.map((g) => g === existing ? { ...g, enabled } : g)
      : [...config.games, { slug, enabled, editionSlug: null, weight: 1, minimumDaysBetweenEvents: 5 }];
    patch({ games });
  }

  function updateGame(slug: string, change: { editionSlug?: string | null; weight?: number; minimumDaysBetweenEvents?: number }) {
    if (!config) return;
    patch({ games: config.games.map((g) => g.slug === slug ? { ...g, ...change } : g) });
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/events/nightly", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(config),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save schedule");
      setMessage("Nightly schedule saved. Existing events and RSVPs were not changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Nightly Game Nights">
      <h2 className="text-lg font-bold">Nightly Game Nights</h2>
      <p className="mt-1 text-sm text-muted-foreground">Publish one Game Night each evening. Hosting eligibility is configured separately. Existing events stay in place when this schedule changes.</p>
      {legacyEnabled && <p className="mt-3 text-sm text-amber-600">Disable the legacy pop-up planner before enabling this schedule.</p>}
      {config && <div className="mt-4 space-y-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.enabled} disabled={legacyEnabled} onChange={(e) => patch({ enabled: e.target.checked })} />Enable nightly scheduling</label>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">Local time <input className="ml-2 rounded border bg-background px-2 py-1" type="time" value={config.localTime} onChange={(e) => patch({ localTime: e.target.value })} /></label>
          <label className="text-sm">IANA timezone <input className="ml-2 rounded border bg-background px-2 py-1" value={config.timezone} onChange={(e) => patch({ timezone: e.target.value })} /></label>
          <label className="text-sm">Duration (hours) <input className="ml-2 w-20 rounded border bg-background px-2 py-1" type="number" min="0.5" max="24" step="0.5" value={config.durationHours} onChange={(e) => patch({ durationHours: Number(e.target.value) })} /></label>
          <label className="text-sm">Warmup (hours) <input className="ml-2 w-20 rounded border bg-background px-2 py-1" type="number" min="1" max="24" value={config.warmupHours ?? 4} onChange={(e) => patch({ warmupHours: Number(e.target.value) })} /></label>
          <label className="text-sm">Grace (hours) <input className="ml-2 w-20 rounded border bg-background px-2 py-1" type="number" min="0" max="24" value={config.graceHours ?? 1} onChange={(e) => patch({ graceHours: Number(e.target.value) })} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={config.weeklyNotification?.enabled ?? false} onChange={(e) => patch({ weeklyNotification: { ...(config.weeklyNotification || { weekday: 1, localTime: "10:00" }), enabled: e.target.checked } })} />Weekly in-app schedule notice</label>
          <label>Day <select className="ml-1 rounded border bg-background px-2 py-1" value={config.weeklyNotification?.weekday ?? 1} onChange={(e) => patch({ weeklyNotification: { ...(config.weeklyNotification || { enabled: false, localTime: "10:00" }), weekday: Number(e.target.value) } })}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>
          <label>Time <input className="ml-1 rounded border bg-background px-2 py-1" type="time" value={config.weeklyNotification?.localTime ?? "10:00"} onChange={(e) => patch({ weeklyNotification: { ...(config.weeklyNotification || { enabled: false, weekday: 1 }), localTime: e.target.value } })} /></label>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Eligible multiplayer games</h3>
          <div className="mt-2 grid max-h-60 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((game) => <label key={game.slug} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(config.games.find((g) => g.slug === game.slug)?.enabled)} onChange={(e) => toggle(game.slug, e.target.checked)} />{game.title}</label>)}
          </div>
          <div className="mt-3 space-y-2">
            {config.games.filter((g) => g.enabled).map((game) => {
              const candidate = candidates.find((c) => c.slug === game.slug);
              return <div key={`${game.slug}:${game.editionSlug || "base"}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <strong className="min-w-32">{candidate?.title || game.slug}</strong>
                <label>Edition <select className="ml-1 rounded border bg-background px-2 py-1" value={game.editionSlug || ""} onChange={(e) => updateGame(game.slug, { editionSlug: e.target.value || null })}>
                  <option value="">Base game</option>
                  {candidate?.editions.map((edition) => <option key={edition.slug} value={edition.slug}>{edition.name}</option>)}
                </select></label>
                <label>Weight <input className="ml-1 w-16 rounded border bg-background px-2 py-1" type="number" min="1" max="100" value={game.weight} onChange={(e) => updateGame(game.slug, { weight: Number(e.target.value) })} /></label>
                <label>Minimum days between <input className="ml-1 w-16 rounded border bg-background px-2 py-1" type="number" min="0" max="365" value={game.minimumDaysBetweenEvents} onChange={(e) => updateGame(game.slug, { minimumDaysBetweenEvents: Number(e.target.value) })} /></label>
              </div>;
            })}
          </div>
        </div>
        <button type="button" disabled={saving} onClick={save} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save schedule</button>
      </div>}
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
  );
}
