"use client";

import { useEffect, useState } from "react";
import type { NightlyScheduleConfig } from "@/lib/models/AutomatedEventConfig";

type Candidate = { slug: string; title: string; editions: { slug: string; name: string }[] };

export function NightlyPlannerPanel() {
  const [config, setConfig] = useState<NightlyScheduleConfig | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/events/nightly")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Could not load nightly schedule")))
      .then((data) => {
        setConfig(data.nightly);
        setCandidates(data.candidates);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  function patch(p: Partial<NightlyScheduleConfig>) {
    setConfig((current) => current ? { ...current, ...p } : current);
  }

  /*
   * Each game and each of its editions is its own rotation entry, as in the
   * old pop-up planner — OpenRA's Red Alert, Tiberian Dawn and Dune 2000 can
   * all be eligible and alternate. Entries are keyed by slug + edition.
   */
  const sameEntry = (g: { slug: string; editionSlug?: string | null }, slug: string, editionSlug: string | null) =>
    g.slug === slug && (g.editionSlug || null) === editionSlug;

  function entryFor(slug: string, editionSlug: string | null) {
    return config?.games.find((g) => sameEntry(g, slug, editionSlug));
  }

  function toggle(slug: string, editionSlug: string | null, enabled: boolean) {
    if (!config) return;
    const existing = entryFor(slug, editionSlug);
    const games = existing
      ? config.games.map((g) => g === existing ? { ...g, enabled } : g)
      : [...config.games, { slug, enabled, editionSlug, weight: 1, minimumDaysBetweenEvents: 0 }];
    patch({ games });
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/events/nightly", {
        /*
         * Weight and minimum-days are not offered: every entry is equal and
         * the planner rotates by longest absence. Normalised here so older
         * saved values cannot quietly skew or block the rotation.
         */
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...config, games: config.games.map((g) => ({ ...g, weight: 1, minimumDaysBetweenEvents: 0 })) }),
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
      {config && <div className="mt-4 space-y-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />Enable nightly scheduling</label>
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
          <h3 className="text-sm font-semibold">Eligible multiplayer games &amp; editions</h3>
          <p className="text-xs text-muted-foreground">Tick the base game and/or individual editions. Each ticked one is its own entry; the planner picks whichever has gone longest without a Game Night.</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((game) => <div key={game.slug} className="rounded-lg border border-border px-2 py-1.5 text-sm">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={Boolean(entryFor(game.slug, null)?.enabled)} onChange={(e) => toggle(game.slug, null, e.target.checked)} />{game.title}</label>
              {game.editions.length > 0 && <div className="mt-1 space-y-0.5 pl-5">
                {game.editions.map((edition) => <label key={edition.slug} className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={Boolean(entryFor(game.slug, edition.slug)?.enabled)} onChange={(e) => toggle(game.slug, edition.slug, e.target.checked)} />{edition.name}</label>)}
              </div>}
            </div>)}
          </div>
        </div>
        <button type="button" disabled={saving} onClick={save} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save schedule</button>
      </div>}
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
  );
}
