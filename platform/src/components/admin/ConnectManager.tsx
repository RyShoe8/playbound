"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDrive,
  Loader2,
  Network,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";

type Alert = { type: "warning" | "error" | "info"; title: string; message: string };

type LastSpawnTestEntry = {
  ok: boolean;
  error?: string | null;
  at: string;
  durationMs?: number | null;
  port?: number | null;
};

type OverviewData = {
  configured: boolean;
  host: string | null;
  health: {
    rooms?: number;
    maxRooms?: number;
    publicIp?: string | null;
  } | null;
  lastSpawnTest?: Record<string, LastSpawnTestEntry>;
  metrics: {
    uptimeSec?: number;
    cpu?: { cores?: number; load1?: number; usagePercent?: number | null };
    memory?: { usedBytes?: number; totalBytes?: number; usedPercent?: number };
    storage?: Array<{
      path: string;
      usedBytes: number;
      totalBytes: number;
      usedPercent: number;
    }>;
    bandwidth?: { rxMbps?: number; txMbps?: number; iface?: string | null };
    agentVersion?: string;
    collectedAt?: string;
  } | null;
  rooms: Array<{
    roomId: string;
    partyId: string;
    gameSlug: string;
    name?: string;
    host: string;
    port: number;
    createdAt?: number;
  }>;
  games: Array<{
    slug: string;
    title: string;
    installed: boolean;
    ready: boolean;
  }>;
  alerts: Alert[];
  roomsError?: string | null;
};

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatUptime(sec?: number) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function SpawnStatusDot({
  entry,
}: {
  entry?: LastSpawnTestEntry;
}) {
  if (!entry) {
    return (
      <span
        className="inline-block size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
        title="No spawn test yet"
      />
    );
  }
  const title = entry.ok
    ? `Last spawn OK · ${formatWhen(entry.at)}${entry.durationMs ? ` · ${entry.durationMs}ms` : ""}`
    : `Last spawn failed · ${formatWhen(entry.at)}${entry.error ? ` · ${entry.error}` : ""}`;
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${
        entry.ok ? "bg-emerald-500" : "bg-red-500"
      }`}
      title={title}
    />
  );
}

function ProgressBar({ percent, tone }: { percent: number; tone?: "default" | "warn" | "danger" }) {
  const bar =
    tone === "danger"
      ? "bg-red-500"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-primary";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

function MetricCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Cpu;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4" />
        {title}
      </div>
      {children}
    </div>
  );
}

export function ConnectManager() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ensureBusy, setEnsureBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testAllBusy, setTestAllBusy] = useState(false);
  const [testingSlug, setTestingSlug] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/connect/overview", { cache: "no-store" });
      const json = (await res.json()) as OverviewData;
      if (!res.ok) throw new Error("Failed to load Connect overview");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function runEnsureMissing() {
    setEnsureBusy(true);
    try {
      const res = await fetch("/api/admin/connect/ensure-missing", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "Ensure missing games failed");
      }
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ensure failed");
    } finally {
      setEnsureBusy(false);
    }
  }

  async function runTestSpawn(gameSlug: string) {
    setTestBusy(true);
    setTestingSlug(gameSlug);
    setTestStatus(`Starting ${gameSlug}…`);
    setError(null);
    try {
      const res = await fetch("/api/admin/connect/test-spawn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameSlug }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        result?: { ok?: boolean; error?: string };
      };
      if (!json.ok) {
        setTestStatus(json.message || json.result?.error || `Spawn test failed for ${gameSlug}`);
        setError(json.message || json.result?.error || `Spawn test failed for ${gameSlug}`);
      } else {
        setTestStatus(`${gameSlug} spawn OK`);
      }
      await load(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Spawn test failed";
      setTestStatus(message);
      setError(message);
    } finally {
      setTestBusy(false);
      setTestingSlug(null);
    }
  }

  async function runTestAll() {
    setTestAllBusy(true);
    setTestStatus("Testing all installed games…");
    setError(null);
    try {
      const res = await fetch("/api/admin/connect/test-spawn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        result?: { results?: Record<string, { ok?: boolean; skipped?: boolean }> };
      };
      if (!json.ok) {
        setTestStatus(json.message || "Test all failed");
        setError(json.message || "Test all failed");
      } else {
        const results = json.result?.results || {};
        const tested = Object.values(results).filter((r) => !r.skipped).length;
        const passed = Object.values(results).filter((r) => r.ok).length;
        setTestStatus(`Finished: ${passed}/${tested} passed`);
      }
      await load(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test all failed";
      setTestStatus(message);
      setError(message);
    } finally {
      setTestAllBusy(false);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading Connect status…</p>;
  }

  const metrics = data?.metrics;
  const memPct = metrics?.memory?.usedPercent ?? 0;
  const cpuPct = metrics?.cpu?.usagePercent;
  const rootDisk = metrics?.storage?.find((s) => s.path === "/");
  const hostDisk = metrics?.storage?.find((s) => s.path.includes("playbound-host"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void runEnsureMissing()}
          disabled={ensureBusy || !data?.configured}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Server className="size-4" />
          {ensureBusy ? "Ensuring…" : "Ensure missing games"}
        </button>
        <button
          type="button"
          onClick={() => void runTestAll()}
          disabled={testAllBusy || testBusy || !data?.configured}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
        >
          {testAllBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          {testAllBusy ? "Testing all…" : "Test all games"}
        </button>
        {data?.host && (
          <span className="text-sm text-muted-foreground">
            VPS <span className="font-mono text-foreground">{data.host}</span>
          </span>
        )}
        {testStatus && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            {(testBusy || testAllBusy) && <Loader2 className="size-4 animate-spin" />}
            {testStatus}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {data?.alerts?.map((alert) => (
        <div
          key={`${alert.title}-${alert.message}`}
          className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${
            alert.type === "error"
              ? "border-red-500/30 bg-red-500/10"
              : alert.type === "warning"
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-border bg-secondary/40"
          }`}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">{alert.title}</p>
            <p className="text-muted-foreground">{alert.message}</p>
          </div>
        </div>
      ))}

      {!data?.configured ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="CPU" icon={Cpu}>
              <p className="text-2xl font-bold">
                {cpuPct != null ? `${cpuPct}%` : `load ${metrics?.cpu?.load1 ?? "—"}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {metrics?.cpu?.cores ?? "—"} cores · uptime {formatUptime(metrics?.uptimeSec)}
              </p>
              {cpuPct != null && (
                <div className="mt-3">
                  <ProgressBar
                    percent={cpuPct}
                    tone={cpuPct > 85 ? "danger" : cpuPct > 70 ? "warn" : "default"}
                  />
                </div>
              )}
            </MetricCard>

            <MetricCard title="Memory" icon={Activity}>
              <p className="text-2xl font-bold">{memPct}%</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatBytes(metrics?.memory?.usedBytes)} / {formatBytes(metrics?.memory?.totalBytes)}
              </p>
              <div className="mt-3">
                <ProgressBar
                  percent={memPct}
                  tone={memPct > 90 ? "danger" : memPct > 75 ? "warn" : "default"}
                />
              </div>
            </MetricCard>

            <MetricCard title="Storage" icon={HardDrive}>
              <p className="text-2xl font-bold">{rootDisk?.usedPercent ?? "—"}%</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Root {formatBytes(rootDisk?.usedBytes)} / {formatBytes(rootDisk?.totalBytes)}
              </p>
              {hostDisk && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Host {formatBytes(hostDisk.usedBytes)} used ({hostDisk.usedPercent}%)
                </p>
              )}
              <div className="mt-3">
                <ProgressBar
                  percent={rootDisk?.usedPercent ?? 0}
                  tone={
                    (rootDisk?.usedPercent ?? 0) > 90
                      ? "danger"
                      : (rootDisk?.usedPercent ?? 0) > 75
                        ? "warn"
                        : "default"
                  }
                />
              </div>
            </MetricCard>

            <MetricCard title="Bandwidth" icon={Network}>
              <p className="text-2xl font-bold">
                ↓ {metrics?.bandwidth?.rxMbps ?? 0} · ↑ {metrics?.bandwidth?.txMbps ?? 0} Mbps
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {metrics?.bandwidth?.iface || "iface"} · agent v{metrics?.agentVersion || "?"}
              </p>
            </MetricCard>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Active rooms</h2>
              <span className="text-sm text-muted-foreground">
                {data.health?.rooms ?? 0} / {data.health?.maxRooms ?? "—"} slots
              </span>
            </div>
            {data.roomsError && (
              <p className="text-sm text-amber-400">{data.roomsError}</p>
            )}
            {data.rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dedicated rooms running.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Game</th>
                      <th className="pb-2 pr-4 font-medium">Port</th>
                      <th className="pb-2 pr-4 font-medium">Party</th>
                      <th className="pb-2 font-medium">Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rooms.map((room) => (
                      <tr key={room.roomId} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-mono text-xs">{room.gameSlug}</td>
                        <td className="py-2 pr-4">{room.port}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{room.partyId.slice(-8)}</td>
                        <td className="py-2">{room.name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Dedicated games on VPS</h2>
              <p className="text-xs text-muted-foreground">
                Green/red dot = last spawn test · install icon = files on disk
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.games.map((game) => {
                const Icon = game.ready ? CheckCircle2 : game.installed ? AlertTriangle : XCircle;
                const tone = game.ready
                  ? "text-emerald-400"
                  : game.installed
                    ? "text-amber-400"
                    : "text-red-400";
                const spawnEntry = data.lastSpawnTest?.[game.slug];
                const isTesting = testingSlug === game.slug;
                return (
                  <div
                    key={game.slug}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                  >
                    <Icon className={`size-4 shrink-0 ${tone}`} />
                    <SpawnStatusDot entry={spawnEntry} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{game.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {game.ready ? "Ready" : game.installed ? "Binary only" : "Missing"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runTestSpawn(game.slug)}
                      disabled={testBusy || testAllBusy || !game.installed || isTesting}
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary disabled:opacity-50"
                    >
                      {isTesting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        "Test"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
