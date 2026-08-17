"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import type { OpsFamily } from "@/lib/admin/opsEvents";

type OpsItem = {
  _id: string;
  event: string;
  properties?: Record<string, unknown>;
  userId?: string | null;
  createdAt: string;
};

export function AdminOpsConsole({
  initialFamily,
  initialGame,
}: {
  initialFamily: OpsFamily;
  initialGame: string;
}) {
  const [family, setFamily] = useState<OpsFamily>(initialFamily);
  const [gameSlug, setGameSlug] = useState(initialGame);
  const [items, setItems] = useState<OpsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [range, setRange] = useState("24h");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("family", family);
    params.set("limit", "80");
    if (gameSlug.trim()) params.set("gameSlug", gameSlug.trim());
    const now = Date.now();
    const hours = range === "1h" ? 1 : range === "7d" ? 168 : 24;
    params.set("from", new Date(now - hours * 60 * 60 * 1000).toISOString());
    try {
      const res = await fetch(`/api/admin/telemetry?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items?: OpsItem[]; total?: number };
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
    } finally {
      setLoading(false);
    }
  }, [family, gameSlug, range]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "launcher", "party"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFamily(f)}
            className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
              family === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
        {(["1h", "24h", "7d"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              range === r ? "bg-secondary text-foreground" : "text-muted-foreground"
            }`}
          >
            {r}
          </button>
        ))}
        <input
          value={gameSlug}
          onChange={(e) => setGameSlug(e.target.value)}
          placeholder="Filter game slug"
          className="h-8 rounded-lg border border-input bg-secondary/50 px-3 text-sm"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {loading ? "Loading…" : `${total} events`} · refreshes every 5s
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Game</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">Party</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No events in this window.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const props = item.properties || {};
                const slug = typeof props.gameSlug === "string" ? props.gameSlug : "";
                const partyId = typeof props.partyId === "string" ? props.partyId : "";
                const detail =
                  (typeof props.message === "string" && props.message) ||
                  (typeof props.code === "string" && props.code) ||
                  (typeof props.host === "string" && `${props.host}:${props.port || ""}`) ||
                  "";
                return (
                  <tr key={String(item._id)} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">
                      <LocalTime value={item.createdAt} />
                    </td>
                    <td className="px-3 py-2 font-semibold">{item.event}</td>
                    <td className="px-3 py-2">
                      {slug ? (
                        <Link href={`/admin/games/${slug}/edit`} className="text-primary hover:underline">
                          {slug}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {item.userId ? String(item.userId).slice(-8) : "—"}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-muted-foreground" title={detail}>
                      {detail || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {partyId ? partyId.slice(-8) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
