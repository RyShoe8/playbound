"use client";

import { useState } from "react";

/**
 * The two numbers that govern free parties, edited against live usage.
 *
 * Usage sits beside the inputs rather than on another screen: the only way to
 * judge whether a shared budget is the right size is to see how much of it is
 * claimed, and setting it blind is guessing.
 */

type Limits = {
  freePartySlotPool: number;
  maxFreePartySize: number;
};

type Usage = {
  pool: number;
  inUse: number;
  available: number;
  maxFreePartySize: number;
};

export function PlatformLimitsEditor({
  initialLimits,
  initialUsage,
}: {
  initialLimits: Limits;
  initialUsage: Usage;
}) {
  const [limits, setLimits] = useState(initialLimits);
  const [usage, setUsage] = useState(initialUsage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const set = <K extends keyof Limits>(key: K, value: Limits[K]) =>
    setLimits((prev) => ({ ...prev, [key]: value }));

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/platform-limits", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(limits),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setLimits(data.limits);
      setUsage(data.usage);
      setMessage({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  const pct = usage.pool > 0 ? Math.min(100, Math.round((usage.inUse / usage.pool) * 100)) : 0;
  /*
   * Setting the pool below what is already claimed is allowed — nobody is
   * evicted, because seats are held until their member leaves — but it stops
   * new joins until usage falls back under the line. Say so rather than
   * letting an admin find out from support tickets.
   */
  const oversubscribed = limits.freePartySlotPool < usage.inUse;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Right now</h2>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <Stat label="Pool" value={usage.pool} />
          <Stat label="In use" value={usage.inUse} />
          <Stat label="Available" value={usage.available} />
        </div>
        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${usage.inUse} of ${usage.pool} free party seats in use`}
        >
          <div
            className={pct >= 90 ? "h-full bg-red-500" : pct >= 70 ? "h-full bg-amber-500" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      <section className="space-y-5 rounded-xl border border-border bg-card p-5">
        <Field
          label="Free party seats"
          hint="Concurrent free seats across the whole platform, shared by everyone. A subscriber's own slots are separate and stack on top of whatever is free here. Zero turns free parties off."
        >
          <input
            type="number"
            min={0}
            value={limits.freePartySlotPool}
            onChange={(e) => set("freePartySlotPool", Number(e.target.value))}
            className="w-40 rounded-lg border border-border bg-background px-3 py-2"
          />
        </Field>

        {oversubscribed ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {usage.inUse} seats are already claimed, which is more than this. Nobody will be
            removed — seats are held until their member leaves — but no new free joins will happen
            until usage falls below the new figure.
          </p>
        ) : null}

        <Field
          label="Max free party size"
          hint="The largest a party can get without a subscription. Subscribers are limited by the slots they bought plus whatever the pool has spare."
        >
          <input
            type="number"
            min={2}
            value={limits.maxFreePartySize}
            onChange={(e) => set("maxFreePartySize", Number(e.target.value))}
            className="w-40 rounded-lg border border-border bg-background px-3 py-2"
          />
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {message ? (
            <span className={message.kind === "ok" ? "text-sm text-green-600" : "text-sm text-red-600"}>
              {message.text}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold">{label}</label>
      <p className="max-w-2xl text-sm text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}
