"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";

type MetricsController = {
  controllerId?: string;
  playerSlot?: number | null;
  status?: string;
  transport?: string;
  pingMs?: number | null;
  jitterMs?: number | null;
  hz?: number;
  packets?: number;
  packetLoss?: number;
};

type StreamingSession = {
  sessionId: string;
  joinCode: string;
  hostLabel: string;
  maxPlayers: number;
  reserveHostSlot: boolean;
  createdAt: number;
  lastHeartbeat: number;
  ageSec: number;
  heartbeatAgeSec: number;
  controllers: Array<{
    controllerId?: string;
    label?: string;
    status?: string;
    playerSlot?: number | null;
  }>;
  runtimeMetrics: {
    collectedAt?: string;
    controllers?: MetricsController[];
  } | null;
};

export function ConnectStreamingManager() {
  const [enabled, setEnabled] = useState(false);
  const [sessions, setSessions] = useState<StreamingSession[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/connect/streaming", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setEnabled(Boolean(data.settings?.streamingMetricsEnabled));
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setMessage(typeof data.message === "string" ? data.message : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      void load();
    }, 3000);
    return () => window.clearInterval(id);
  }, [enabled, load]);

  async function toggle(next: boolean) {
    setToggling(true);
    try {
      const res = await fetch("/api/admin/connect/streaming-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamingMetricsEnabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setEnabled(Boolean(data.settings?.streamingMetricsEnabled));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Collect streaming metrics</p>
          <p className="text-xs text-muted-foreground">
            When on, the host launcher posts pad/stream stats for open Couch sessions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={toggling || loading}
            onClick={() => void toggle(!enabled)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              enabled
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
          >
            {toggling ? "Saving…" : enabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : !enabled ? (
        <p className="text-sm text-muted-foreground">
          {message || "Collection is idle. Turn it on to see live Couch sessions."}
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open Couch sessions. Start online multiplayer on a host with launcher ≥ 0.3.74, then
          wait a few seconds for the first metrics post.
        </p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const metricsRows = s.runtimeMetrics?.controllers || [];
            return (
              <div
                key={s.sessionId}
                className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-mono text-base font-bold tracking-wide">{s.joinCode}</span>
                    <span className="ml-2 text-muted-foreground">{s.hostLabel}</span>
                    {s.reserveHostSlot ? (
                      <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-semibold">
                        host P1 reserved
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    age {s.ageSec}s · heartbeat {s.heartbeatAgeSec}s ago
                    {s.runtimeMetrics?.collectedAt ? (
                      <>
                        {" "}
                        · metrics{" "}
                        <LocalTime value={s.runtimeMetrics.collectedAt} />
                      </>
                    ) : (
                      " · waiting for host report"
                    )}
                  </div>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Slot</th>
                        <th className="py-1 pr-2 font-medium">Controller</th>
                        <th className="py-1 pr-2 font-medium">Status</th>
                        <th className="py-1 pr-2 font-medium">Transport</th>
                        <th className="py-1 pr-2 font-medium">Ping</th>
                        <th className="py-1 pr-2 font-medium">Hz</th>
                        <th className="py-1 pr-2 font-medium">Loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(s.controllers.length ? s.controllers : [{ label: "—" }]).map((c, i) => {
                        const m =
                          metricsRows.find((r) => r.controllerId === c.controllerId) ||
                          metricsRows[i];
                        return (
                          <tr key={c.controllerId || `row-${i}`} className="border-t border-border/60">
                            <td className="py-1.5 pr-2 font-mono">
                              {c.playerSlot != null ? c.playerSlot : "—"}
                            </td>
                            <td className="py-1.5 pr-2">{c.label || c.controllerId || "—"}</td>
                            <td className="py-1.5 pr-2">{c.status || "—"}</td>
                            <td className="py-1.5 pr-2">{m?.transport || "—"}</td>
                            <td className="py-1.5 pr-2 font-mono">
                              {m?.pingMs != null ? `${Math.round(m.pingMs)}ms` : "—"}
                            </td>
                            <td className="py-1.5 pr-2 font-mono">{m?.hz ?? "—"}</td>
                            <td className="py-1.5 pr-2 font-mono">
                              {m?.packetLoss != null
                                ? `${Math.round(m.packetLoss * 1000) / 10}%`
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
