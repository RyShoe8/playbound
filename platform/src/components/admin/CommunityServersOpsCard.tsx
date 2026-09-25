"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Server,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Play,
  RotateCcw,
  ExternalLink,
  ShieldAlert,
  Cpu,
  HardDrive,
  Clock,
  Bug,
  Activity,
} from "lucide-react";
import type { CommunityServerAlert } from "@/app/api/admin/ops/community-servers/route";

type ServerRecord = {
  _id: string;
  slug: string;
  name: string;
  gameSlug: string;
  editionSlug?: string | null;
  editionName?: string | null;
  desiredState: string;
  runtimeState: string;
  health: string;
  host?: string | null;
  port?: number | null;
  playerCount?: number | null;
  recoveryAttempts: number;
  nextRecoveryAt?: string | null;
  decisionReason?: string | null;
  lastReconciledAt?: string | null;
  updatedAt?: string | null;
};

type OpenBug = {
  _id: string;
  title: string;
  errorCode?: string | null;
  gameSlug?: string | null;
  editionSlug?: string | null;
  occurrenceCount: number;
  lastSeenAt?: string | null;
};

type OpsData = {
  alerts: CommunityServerAlert[];
  stats: {
    total: number;
    running: number;
    pending: number;
    failed: number;
    exhausted: number;
    openBugsCount: number;
  };
  node: {
    configured: boolean;
    agentReachable: boolean;
    agentError?: string | null;
    nodeEnabled: boolean;
    draining: boolean;
    regionLabel: string;
    autoHostingEnabled: boolean;
    metrics?: {
      collectedAt?: string;
      cpu?: { usagePercent?: number | null; cores?: number };
      memory?: { totalBytes?: number; freeBytes?: number; usedPercent?: number };
      storage?: Array<{ path: string; totalBytes: number; usedBytes: number; freeBytes: number; usedPercent: number }>;
    } | null;
    activeRoomsOnAgent: number;
  };
  safety: {
    maxCpuPercent: number;
    maxRamPercent: number;
    minFreeRamBytes: number;
    maxMetricsAgeSeconds: number;
  };
  servers: ServerRecord[];
  openBugs: OpenBug[];
  lease: {
    active: boolean;
    leaseUntil?: string | null;
    updatedAt?: string | null;
  };
};

const GIB = 1024 ** 3;

export function CommunityServersOpsCard({ onSelectServersFamily }: { onSelectServersFamily?: () => void }) {
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileFeedback, setReconcileFeedback] = useState<string | null>(null);
  const [clearingServerId, setClearingServerId] = useState<string | null>(null);
  const [showAllServers, setShowAllServers] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/ops/community-servers");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to fetch status: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load community servers telemetry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      void fetchStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function triggerReconcile() {
    setReconciling(true);
    setReconcileFeedback(null);
    try {
      const res = await fetch("/api/admin/ops/community-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Reconciliation failed");
      const action = body.result?.action || "done";
      const reason = body.result?.reason ? ` (${body.result.reason})` : "";
      setReconcileFeedback(`Reconciliation completed: ${action}${reason}`);
      await fetchStatus();
    } catch (err) {
      setReconcileFeedback(`Reconciliation error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReconciling(false);
    }
  }

  async function resetRecovery(serverId: string) {
    setClearingServerId(serverId);
    try {
      const res = await fetch("/api/admin/ops/community-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetRecovery", serverId }),
      });
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error || "Reset failed");
      }
      await fetchStatus();
    } catch (err) {
      alert(`Could not reset recovery backoff: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClearingServerId(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Server className="size-5 animate-pulse text-primary" />
          <h2 className="text-base font-semibold">Automated Community Servers Health</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Checking VPS node status, server runtime states, and capacity limits...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-red-500" />
            <h2 className="text-base font-semibold text-red-500">Community Servers Telemetry Error</h2>
          </div>
          <button
            type="button"
            onClick={() => void fetchStatus()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <RefreshCw className="size-3.5" /> Retry
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const criticalAlerts = data.alerts.filter((a) => a.level === "critical");
  const warningAlerts = data.alerts.filter((a) => a.level === "warning");
  const hasProblems = criticalAlerts.length > 0 || warningAlerts.length > 0 || data.stats.failed > 0 || data.stats.exhausted > 0;

  const cpuPercent = data.node.metrics?.cpu?.usagePercent;
  const cpuMax = data.safety.maxCpuPercent;
  const isCpuCritical = cpuPercent != null && cpuPercent >= cpuMax;
  const isCpuWarning = cpuPercent != null && cpuPercent >= cpuMax - 10 && !isCpuCritical;

  const freeRamBytes = data.node.metrics?.memory?.freeBytes;
  const minRamBytes = data.safety.minFreeRamBytes;
  const isRamCritical = freeRamBytes != null && freeRamBytes < minRamBytes;

  const degradedServers = data.servers.filter(
    (s) =>
      s.runtimeState === "failed" ||
      s.health === "unhealthy" ||
      s.recoveryAttempts > 0 ||
      s.decisionReason === "INSUFFICIENT_CAPACITY" ||
      s.decisionReason === "NO_HEALTHY_NODE"
  );

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm" aria-label="Community Servers Operations">
      {/* Header with Title, Status Badge, and Action Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Server className="size-5 text-primary" />
            <h2 className="text-base font-semibold">Automated Community Servers Health</h2>
            {criticalAlerts.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-500">
                <AlertCircle className="size-3.5" /> {criticalAlerts.length} Critical Issue{criticalAlerts.length > 1 ? "s" : ""}
              </span>
            ) : warningAlerts.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-500">
                <AlertTriangle className="size-3.5" /> {warningAlerts.length} Warning{warningAlerts.length > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                <CheckCircle2 className="size-3.5" /> Fleet Healthy
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            VPS node capacity, runtime error monitoring, and automatic rotation recovery.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSelectServersFamily ? (
            <button
              type="button"
              onClick={onSelectServersFamily}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Cpu className="size-3.5 text-muted-foreground" /> Server Logs
            </button>
          ) : (
            <Link
              href="/admin/ops?family=servers"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Cpu className="size-3.5 text-muted-foreground" /> Server Logs
            </Link>
          )}

          <Link
            href="/admin/connect/game-servers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <ExternalLink className="size-3.5 text-muted-foreground" /> Manage Config
          </Link>

          {data.openBugs.length > 0 && (
            <Link
              href="/admin/bugs"
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/20"
            >
              <Bug className="size-3.5" /> {data.openBugs.length} Server Bug{data.openBugs.length > 1 ? "s" : ""}
            </Link>
          )}

          <button
            type="button"
            disabled={reconciling}
            onClick={() => void triggerReconcile()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title="Execute an immediate reconciliation cycle on the fleet"
          >
            <Play className={`size-3.5 ${reconciling ? "animate-spin" : ""}`} />
            {reconciling ? "Reconciling..." : "Run Reconcile"}
          </button>

          <button
            type="button"
            onClick={() => void fetchStatus()}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Refresh community server diagnostics"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {reconcileFeedback && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
          <span>{reconcileFeedback}</span>
          <button
            type="button"
            onClick={() => setReconcileFeedback(null)}
            className="text-muted-foreground hover:text-foreground font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics & Diagnostic Summary Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {/* Node & Agent Status */}
        <div className="rounded-lg border border-border bg-card/60 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>VPS Host Node</span>
            <Server className="size-3.5" />
          </div>
          <p className="mt-1 font-semibold">
            {data.node.agentReachable ? (
              <span className="text-emerald-500">Reachable</span>
            ) : (
              <span className="text-red-500">Unreachable</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate" title={data.node.regionLabel}>
            {data.node.regionLabel} · {data.node.activeRoomsOnAgent} room{data.node.activeRoomsOnAgent === 1 ? "" : "s"}
          </p>
        </div>

        {/* Node CPU & Safety Threshold */}
        <div className={`rounded-lg border p-3 ${isCpuCritical ? "border-red-500/40 bg-red-500/5" : isCpuWarning ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card/60"}`}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>CPU Usage</span>
            <Cpu className="size-3.5" />
          </div>
          <p className="mt-1 font-semibold">
            {cpuPercent != null ? `${cpuPercent}%` : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">/ max {cpuMax}%</span>
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${isCpuCritical ? "bg-red-500" : isCpuWarning ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(100, cpuPercent || 0)}%` }}
            />
          </div>
        </div>

        {/* Free RAM & Safety Floor */}
        <div className={`rounded-lg border p-3 ${isRamCritical ? "border-red-500/40 bg-red-500/5" : "border-border bg-card/60"}`}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Free RAM</span>
            <HardDrive className="size-3.5" />
          </div>
          <p className="mt-1 font-semibold">
            {freeRamBytes != null ? `${(freeRamBytes / GIB).toFixed(1)} GB` : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / floor {(minRamBytes / GIB).toFixed(1)} GB
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isRamCritical ? <span className="text-red-500 font-medium">Memory floor breach</span> : "Safety floor intact"}
          </p>
        </div>

        {/* Fleet Running vs Failed */}
        <div className="rounded-lg border border-border bg-card/60 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Server Fleet</span>
            <Activity className="size-3.5" />
          </div>
          <p className="mt-1 font-semibold">
            <span className="text-emerald-500">{data.stats.running} active</span>
            {data.stats.failed > 0 && <span className="ml-1.5 text-red-500">· {data.stats.failed} failed</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.stats.pending > 0 ? `${data.stats.pending} pending · ` : ""}
            {data.stats.exhausted > 0 ? (
              <span className="text-red-500 font-semibold">{data.stats.exhausted} exhausted</span>
            ) : (
              `${data.stats.total} total managed`
            )}
          </p>
        </div>

        {/* Automation Status & Cron */}
        <div className="col-span-2 rounded-lg border border-border bg-card/60 p-3 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Rotation Engine</span>
            <Clock className="size-3.5" />
          </div>
          <p className="mt-1 font-semibold">
            {data.node.autoHostingEnabled ? (
              <span className="text-emerald-500">Enabled</span>
            ) : (
              <span className="text-amber-500">Disabled</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.lease.active ? "Reconciling now..." : "15m Cron Schedule"}
          </p>
        </div>
      </div>

      {/* Prominent Active Problem & Alert Banners */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ShieldAlert className="size-3.5" /> Detected Issues & Failures ({data.alerts.length})
          </h3>
          <div className="space-y-1.5">
            {data.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between ${
                  alert.level === "critical"
                    ? "border-red-500/40 bg-red-500/10 text-red-500"
                    : alert.level === "warning"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                    : "border-blue-500/40 bg-blue-500/10 text-blue-400"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    {alert.level === "critical" ? (
                      <AlertCircle className="size-4 shrink-0" />
                    ) : alert.level === "warning" ? (
                      <AlertTriangle className="size-4 shrink-0" />
                    ) : (
                      <ShieldAlert className="size-4 shrink-0" />
                    )}
                    <span>{alert.title}</span>
                  </div>
                  <p className="ml-6 text-foreground/80">{alert.detail}</p>
                </div>
                {alert.actionable === "bugs" && (
                  <Link
                    href="/admin/bugs"
                    className="ml-6 shrink-0 underline font-semibold text-foreground hover:text-primary sm:ml-0"
                  >
                    View Bugs
                  </Link>
                )}
                {alert.actionable === "config" && (
                  <Link
                    href="/admin/connect/game-servers"
                    className="ml-6 shrink-0 underline font-semibold text-foreground hover:text-primary sm:ml-0"
                  >
                    Configure
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Degraded & Failed Servers Section */}
      {degradedServers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Degraded & Unhealthy Servers ({degradedServers.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Server & Game</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Health</th>
                  <th className="px-3 py-2">Recovery</th>
                  <th className="px-3 py-2">Failure Detail / Decision</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {degradedServers.map((s) => {
                  const isExhausted = s.recoveryAttempts >= 3;
                  return (
                    <tr key={s._id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">
                        <div>{s.name}</div>
                        <div className="text-muted-foreground">
                          {s.gameSlug}
                          {s.editionName ? ` · ${s.editionName}` : s.editionSlug ? ` · ${s.editionSlug}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider ${
                            s.runtimeState === "failed"
                              ? "bg-red-500/15 text-red-500"
                              : s.runtimeState === "running"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-amber-500/15 text-amber-500"
                          }`}
                        >
                          {s.runtimeState}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`font-medium ${
                            s.health === "unhealthy"
                              ? "text-red-500"
                              : s.health === "healthy"
                              ? "text-emerald-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          {s.health}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {isExhausted ? (
                          <span className="font-semibold text-red-500">3/3 (Exhausted)</span>
                        ) : s.recoveryAttempts > 0 ? (
                          <span className="text-amber-500">{s.recoveryAttempts}/3 attempts</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-muted-foreground" title={s.decisionReason || ""}>
                        {s.decisionReason || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {s.recoveryAttempts > 0 && (
                          <button
                            type="button"
                            disabled={clearingServerId === s._id}
                            onClick={() => void resetRecovery(s._id)}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                            title="Reset recovery counter and backoff timer so reconciliation can retry"
                          >
                            <RotateCcw className="size-3" />
                            {clearingServerId === s._id ? "Resetting..." : "Reset Backoff"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fleet Overview Toggle (All Servers) */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowAllServers((v) => !v)}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          {showAllServers ? "▼ Hide Full Server Fleet" : `▶ View All Managed Community Servers (${data.servers.length})`}
        </button>

        {showAllServers && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Server Name</th>
                  <th className="px-3 py-2">Game / Edition</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Host:Port</th>
                  <th className="px-3 py-2">Players</th>
                  <th className="px-3 py-2">Last Reconciled</th>
                  <th className="px-3 py-2">Decision Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.servers.length > 0 ? (
                  data.servers.map((s) => (
                    <tr key={s._id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.gameSlug}
                        {s.editionName ? ` · ${s.editionName}` : s.editionSlug ? ` · ${s.editionSlug}` : ""}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider ${
                            s.runtimeState === "running"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : s.runtimeState === "failed"
                              ? "bg-red-500/15 text-red-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.runtimeState}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.host && s.port ? `${s.host}:${s.port}` : "—"}
                      </td>
                      <td className="px-3 py-2">{s.playerCount != null ? s.playerCount : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.lastReconciledAt ? new Date(s.lastReconciledAt).toLocaleTimeString() : "—"}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-muted-foreground" title={s.decisionReason || ""}>
                        {s.decisionReason || "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                      No automated community servers created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
