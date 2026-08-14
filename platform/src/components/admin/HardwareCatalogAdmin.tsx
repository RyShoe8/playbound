"use client";

import { useEffect, useMemo, useState } from "react";
import { PERFORMANCE_TIERS } from "@/lib/hardware/types";

type Row = {
  _id: string;
  displayName: string;
  manufacturer?: string | null;
  tier: string;
  source?: string;
  typicalVramMB?: number | null;
};

export function HardwareCatalogAdmin({ kind }: { kind: "cpus" | "gpus" }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [maker, setMaker] = useState("");
  const [tier, setTier] = useState<(typeof PERFORMANCE_TIERS)[number]>("mid");
  const [vramGB, setVramGB] = useState("");

  async function load() {
    const res = await fetch(`/api/admin/hardware/${kind}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Failed to load");
      return;
    }
    setRows(data[kind] || []);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) setError("Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        (r.manufacturer || "").toLowerCase().includes(q) ||
        r.tier.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  async function saveTier(id: string, nextTier: string) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/hardware/${kind}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, tier: nextTier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Save failed");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r._id === id ? { ...r, tier: nextTier, source: "admin" } : r))
      );
    } finally {
      setBusyId(null);
    }
  }

  async function addSku() {
    setAdding(true);
    setError("");
    try {
      const vram = vramGB ? Number(vramGB) * 1024 : undefined;
      const res = await fetch(`/api/admin/hardware/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: name.trim(),
          manufacturer: maker.trim() || undefined,
          tier,
          typicalVramMB: kind === "gpus" && vram ? vram : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Add failed");
        return;
      }
      setName("");
      setMaker("");
      setVramGB("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <label className="text-xs font-semibold text-muted-foreground">Filter</label>
          <input
            className="mt-1 h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Name, maker, or tier"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {visible.length} of {rows.length} SKUs
        </p>
      </div>
      <form
        className="grid gap-2 rounded-xl border border-border bg-secondary/20 p-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          void addSku();
        }}
      >
        <input
          required
          className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm sm:col-span-2"
          placeholder="Add SKU name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm"
          placeholder="Maker"
          value={maker}
          onChange={(e) => setMaker(e.target.value)}
        />
        <select
          className="h-9 rounded-lg border border-input bg-secondary/50 px-2 text-sm"
          value={tier}
          onChange={(e) => setTier(e.target.value as (typeof PERFORMANCE_TIERS)[number])}
        >
          {PERFORMANCE_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {kind === "gpus" ? (
          <input
            className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm"
            placeholder="VRAM GB (optional)"
            type="number"
            min={1}
            value={vramGB}
            onChange={(e) => setVramGB(e.target.value)}
          />
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={adding || !name.trim()}
          className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-5"
        >
          {adding ? "Adding…" : "Add SKU"}
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Maker</th>
              {kind === "gpus" ? <th className="px-3 py-2">VRAM</th> : null}
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r._id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{r.displayName}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.manufacturer || "—"}</td>
                {kind === "gpus" ? (
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.typicalVramMB ? `${Math.round(r.typicalVramMB / 1024)} GB` : "—"}
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <select
                    disabled={busyId === r._id}
                    value={r.tier}
                    onChange={(e) => void saveTier(r._id, e.target.value)}
                    className="h-8 rounded border border-input bg-secondary/50 px-2 text-xs"
                  >
                    {[...PERFORMANCE_TIERS, "unknown"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">
          No rows yet. Run seed:hardware or sync a launcher profile.
        </p>
      ) : null}
    </div>
  );
}
