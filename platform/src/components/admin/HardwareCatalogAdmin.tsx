"use client";

import { useEffect, useState } from "react";
import { PERFORMANCE_TIERS } from "@/lib/hardware/types";

type Row = {
  _id: string;
  displayName: string;
  manufacturer?: string | null;
  tier: string;
  source?: string;
};

export function HardwareCatalogAdmin({ kind }: { kind: "cpus" | "gpus" }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/hardware/${kind}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Failed to load");
          return;
        }
        setRows(data[kind] || []);
      } catch {
        if (!cancelled) setError("Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  async function saveTier(id: string, tier: string) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/hardware/${kind}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, tier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Save failed");
        return;
      }
      setRows((prev) => prev.map((r) => (r._id === id ? { ...r, tier, source: "admin" } : r)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Maker</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{r.displayName}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.manufacturer || "—"}</td>
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
