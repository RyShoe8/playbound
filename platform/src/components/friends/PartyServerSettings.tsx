"use client";

import { useEffect, useState } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import {
  strongestApplyMode,
  type ServerSettingDefinition,
  type ServerSettingValue,
  type ServerSettingValues,
} from "@/lib/serverControl/settings";
import type { ServerControlCapabilities, ServerRuntimeState } from "@/lib/serverControl/adapter";
import type { ControlFeatureSupport } from "@/lib/serverControl/settings";

type SettingsResponse =
  | { supported: false; reason: string; canEdit: false; features: ControlFeatureSupport[] }
  | {
      features: ControlFeatureSupport[];
      supported: true;
      canEdit: boolean;
      capabilities: ServerControlCapabilities;
      gameSlug: string;
      definitions: ServerSettingDefinition[];
      values: ServerSettingValues;
      status: ServerRuntimeState;
      partySize: number;
    };

/**
 * The party's server, as controls rather than a console.
 *
 * Every control here is generated from the game's declared settings — nothing
 * about Warzone or any other game is written into this component, which is the
 * whole point of the schema. See docs/server-control.md.
 *
 * Nothing renders when the party has no server PlayBound can control. The API
 * still explains why, for the overlay and for admin; a party window is not
 * improved by a paragraph about a server it does not have.
 */
export function PartyServerSettings({ partyId }: { partyId: string }) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<ServerSettingValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* Bumped after a save, so the panel re-reads the server rather than trusting
     what it just sent — a restart can come back with different values. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function read() {
      try {
        const res = await fetch(`/api/parties/${encodeURIComponent(partyId)}/server-settings`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as SettingsResponse;
        if (cancelled) return;
        setData(json);
        setDraft(json.supported ? json.values : {});
      } catch {
        /* The party window keeps working without its server panel. */
      }
    }
    void read();
    return () => {
      cancelled = true;
    };
  }, [partyId, reloadKey]);

  /*
   * A game we have assessed and found nothing to control gets one line saying
   * so. A game nobody has assessed gets silence — "not yet" is not worth a
   * paragraph in someone's party window, but "this game plays one map from
   * start to finish" answers the question they were about to ask.
   */
  if (data && !data.supported) {
    const impossible = data.features.filter((f) => f.status === "unavailable");
    if (!impossible.length) return null;
    return (
      <div className="space-y-2 rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold">Server</h3>
        <p className="text-xs text-muted-foreground">{data.reason}</p>
        <ul className="space-y-1">
          {impossible.map((f) => (
            <li key={f.feature} className="text-xs text-muted-foreground">
              <span className="font-semibold">{f.label}:</span>{" "}
              {(f as { reason: string }).reason}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!data?.supported) return null;

  const changed = data.definitions
    .map((d) => d.key)
    .filter((key) => draft[key] !== undefined && draft[key] !== data.values[key]);
  /*
   * The schema says what a setting could cost on this game; the adapter says
   * what it costs here. A local dedicated server delivers everything at spawn,
   * so a "live" setting still restarts the room — and a warning promising
   * nobody is disconnected would be worse than none.
   */
  const schemaMode = strongestApplyMode(data.gameSlug, changed);
  const mode = !data.capabilities.liveApply && schemaMode ? "restart" : schemaMode;
  const editable = data.canEdit && data.status.status !== "unknown";

  async function apply() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const settings: ServerSettingValues = {};
      for (const key of changed) settings[key] = draft[key];
      const res = await fetch(`/api/parties/${encodeURIComponent(partyId)}/server-settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not change the server");
        return;
      }
      if (json.rejected?.length) {
        setError(
          json.rejected
            .map((r: { key: string; reason: string }) => `${r.key}: ${r.reason}`)
            .join(", ")
        );
      }
      if (json.status?.status === "failed") {
        setError(json.status.error || "The server did not come back up");
      } else if (json.outcome === "restarted") {
        setNotice("Server restarted with the new settings.");
      } else if (json.outcome === "applied-live") {
        setNotice("Applied to the running server. Nobody was disconnected.");
      } else if (json.outcome === "queued") {
        // The server is on the host's PC, so PlayBound cannot reach it — their
        // launcher picks this up. Saying "applied" would be a guess.
        setNotice("Saved. The host's launcher will restart the server shortly.");
      }
      setReloadKey((k) => k + 1);
    } catch {
      setError("Could not reach PlayBound");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Server</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {data.status.status === "running"
            ? `${data.status.host}:${data.status.port}`
            : data.status.status === "unknown"
              ? "Status unavailable"
              : data.status.status}
        </span>
      </div>

      <div className="space-y-3">
        {data.definitions.map((def) => (
          <SettingControl
            key={def.key}
            def={def}
            value={draft[def.key] ?? def.default}
            disabled={!editable || busy}
            onChange={(v) => setDraft((d) => ({ ...d, [def.key]: v }))}
          />
        ))}
      </div>

      {/*
        * Said before the click, not after, and specific to what is actually
        * changing. A restart is the expensive one — it is the people in this
        * party who get dropped — so it is the only one that gets a warning
        * icon. "Next round" is information, not a caution.
        */}
      {mode === "restart" ? (
        <p className="flex items-start gap-2 rounded-md bg-secondary/60 p-3 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Applying this restarts the server and disconnects everyone on it
            {data.partySize > 1 ? `, including the ${data.partySize} of you in this party` : ""}.
          </span>
        </p>
      ) : mode === "next-round" ? (
        <p className="rounded-md bg-secondary/60 p-3 text-xs">
          Takes effect at the next round. Nobody is disconnected.
        </p>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}

      {data.canEdit ? (
        <button
          type="button"
          disabled={!editable || busy || changed.length === 0}
          onClick={() => void apply()}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <RotateCw className="size-3.5 animate-spin" /> : null}
          {busy ? (mode === "restart" ? "Restarting…" : "Applying…") : "Apply changes"}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Only the party leader can change these.</p>
      )}
    </div>
  );
}

function SettingControl({
  def,
  value,
  disabled,
  onChange,
}: {
  def: ServerSettingDefinition;
  value: ServerSettingValue;
  disabled: boolean;
  onChange: (value: ServerSettingValue) => void;
}) {
  const label = (
    <span className="text-xs font-semibold">
      {def.label}
      {def.help ? (
        <span className="ml-2 font-normal text-muted-foreground">{def.help}</span>
      ) : null}
    </span>
  );
  const field = "h-9 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-60";

  if (def.type === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3">
        {label}
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4"
        />
      </label>
    );
  }

  if (def.type === "enum") {
    return (
      <label className="block space-y-1.5">
        {label}
        <select
          value={String(value)}
          disabled={disabled}
          onChange={(e) => {
            const picked = def.options.find((o) => String(o.value) === e.target.value);
            if (picked) onChange(picked.value);
          }}
          className={field}
        >
          {def.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (def.type === "number") {
    return (
      <label className="block space-y-1.5">
        {label}
        <input
          type="number"
          value={Number(value)}
          min={def.min}
          max={def.max}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          className={field}
        />
      </label>
    );
  }

  return (
    <label className="block space-y-1.5">
      {label}
      <input
        type="text"
        value={String(value)}
        maxLength={def.maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      />
    </label>
  );
}
