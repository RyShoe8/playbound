"use client";

import { useState } from "react";

/**
 * The free party pool, edited against live usage.
 *
 * Usage sits beside the input rather than on another screen: the only way to
 * judge whether the pool is the right size is to see how much of it is
 * currently claimed, and an admin setting it blind is guessing.
 */

type Limits = {
  freePartySlotPool: number;
  freePartyHardCap: number;
  freePartyBaseline: number;
  poolEnabled: boolean;
};

type Usage = {
  pool: number;
  inUse: number;
  available: number;
  freeHardCap: number;
  absoluteCap: number;
  enabled: boolean;
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
   * Setting the pool under what is already claimed is allowed — nobody is
   * evicted, because slots are held until their member leaves — but it does
   * stop new joins until usage falls back under the line. Say so rather than
   * letting an admin discover it from support tickets.
   */
  const oversubscribed = limits.poolEnabled && limits.freePartySlotPool < usage.inUse;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Right now</h2>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Stat label="Pool" value={usage.pool} />
          <Stat label="In use" value={usage.inUse} />
          <Stat label="Available" value={usage.available} />
          <Stat label="Free cap" value={usage.freeHardCap} />
          <Stat label="Ceiling" value={usage.absoluteCap} />
        </div>
        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${usage.inUse} of ${usage.pool} free party slots in use`}
        >
          <div
            className={pct >= 90 ? "h-full bg-red-500" : pct >= 70 ? "h-full bg-amber-500" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
        {!usage.enabled ? (
          <p className="mt-3 text-sm text-amber-600">
            The pool is switched off. Only subscribers&apos; own plan slots count, so free accounts
            cannot grow a party beyond themselves.
          </p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Limits</h2>

        <Field
          label="Free party slot pool"
          hint="Concurrent party seats PlayBound funds for everyone, shared platform-wide. A subscriber's own plan slots are separate and stack on top of whatever is free here."
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
            {usage.inUse} slots are already claimed, which is more than this. Nobody will be removed
            — seats are held until their member leaves — but no new free joins will be possible
            until usage falls below the new figure.
          </p>
        ) : null}

        <Field
          label="Free party cap"
          hint="How large a party can get without paying. Binds hosts on no plan and nobody else — a subscriber is limited by the slots they bought plus whatever the pool has spare."
        >
          <input
            type="number"
            min={2}
            max={usage.absoluteCap}
            value={limits.freePartyHardCap}
            onChange={(e) => set("freePartyHardCap", Number(e.target.value))}
            className="w-40 rounded-lg border border-border bg-background px-3 py-2"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            No party of any kind can exceed {usage.absoluteCap}, which is a limit of the party
            schema rather than a setting — raising it is a code change.
          </p>
        </Field>

        <Field
          label="Free party baseline"
          hint="Seats every party gets regardless of the pool. Leave at 0 to make the pool the only free capacity; raise it to guarantee a minimum even when the pool is drained."
        >
          <input
            type="number"
            min={0}
            value={limits.freePartyBaseline}
            onChange={(e) => set("freePartyBaseline", Number(e.target.value))}
            className="w-40 rounded-lg border border-border bg-background px-3 py-2"
          />
        </Field>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={limits.poolEnabled}
            onChange={(e) => set("poolEnabled", e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-semibold">Pool enabled</span>
            <span className="block text-sm text-muted-foreground">
              Turning this off makes subscriptions the only route to a party larger than the
              baseline. Existing parties keep the seats they already hold.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save limits"}
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
