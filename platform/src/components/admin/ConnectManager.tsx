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
import { LocalTime } from "@/components/LocalTime";

type Alert = { type: "warning" | "error" | "info"; title: string; message: string };

type LastSpawnTestEntry = {
  ok: boolean;
  error?: string | null;
  at: string;
  durationMs?: number | null;
  port?: number | null;
};

type ConnectAdminPartyRow = {
  id: string;
  name: string;
  leaderUsername: string;
  gameSlug: string;
  gameTitle: string | null;
  status: string;
  visibility: string;
  memberCount: number;
  readyCount: number;
  inGameCount: number;
  hostedStatus: string;
  hostedHost: string | null;
  hostedPort: number | null;
  hostedError: string | null;
  vpsRoomActive: boolean;
  vpsPort: number | null;
  lastActivity: string;
};

type ConnectAdminPartySummary = {
  partyCount: number;
  playersInParties: number;
  playersInGame: number;
  totalPlayers: number;
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
  activeParties?: ConnectAdminPartyRow[];
  partySummary?: ConnectAdminPartySummary;
  games: Array<{
    slug: string;
    title: string;
    installed: boolean;
    ready: boolean;
    clientVersion: string;
    serverVersion: string;
    serverVersionSource: "detected" | "expected";
    versionMismatch: boolean;
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

function statusTone(status: string) {
  switch (status) {
    case "playing":
    case "launching":
      return "text-emerald-400";
    case "ready":
      return "text-sky-400";
    case "forming":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

function hostedLabel(party: ConnectAdminPartyRow) {
  if (party.hostedStatus === "n/a") return "—";
  const parts = [party.hostedStatus];
  if (party.hostedStatus === "ready" && party.hostedHost && party.hostedPort) {
    parts.push(`${party.hostedHost}:${party.hostedPort}`);
  }
  if (party.vpsRoomActive && party.vpsPort) {
    parts.push(`VPS :${party.vpsPort}`);
  } else if (party.hostedStatus === "ready" && !party.vpsRoomActive) {
    parts.push("VPS missing");
  }
  if (party.hostedError) parts.push(party.hostedError);
  return parts.join(" · ");
}

export function ConnectManager({ view = "game-servers" }: { view?: "game-servers" | "parties" }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ensureBusy, setEnsureBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testAllBusy, setTestAllBusy] = useState(false);
  const [testingSlug, setTestingSlug] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isParties = view === "parties";
  const isServers = view === "game-servers";

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
  const agentOutdated = data?.alerts?.some((a) => a.title === "VPS agent outdated") ?? false;
  const parties = data?.activeParties ?? [];
  const partySummary = data?.partySummary ?? {
    partyCount: 0,
    playersInParties: 0,
    playersInGame: 0,
    totalPlayers: 0,
  };

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
        {isServers ? (
          <>
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
          </>
        ) : null}
        {data?.host && (
          <span className="text-sm text-muted-foreground">
            VPS <span className="font-mono text-foreground">{data.host}</span>
          </span>
        )}
        {isServers && testStatus && (
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

      {isServers &&
        data?.alerts?.map((alert) => (
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

      {isParties ? (
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Active parties</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Live PlayBound parties from MongoDB — roster and in-game presence, not VPS processes alone.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums">{partySummary.totalPlayers}</p>
            <p className="text-xs text-muted-foreground">total players</p>
          </div>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Parties</p>
            <p className="text-xl font-semibold tabular-nums">{partySummary.partyCount}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">In parties</p>
            <p className="text-xl font-semibold tabular-nums">{partySummary.playersInParties}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">In game</p>
            <p className="text-xl font-semibold tabular-nums">{partySummary.playersInGame}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Combined total</p>
            <p className="text-xl font-semibold tabular-nums">{partySummary.totalPlayers}</p>
          </div>
        </div>
        {parties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active parties right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Party</th>
                  <th className="pb-2 pr-4 font-medium">Game</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Members</th>
                  <th className="pb-2 pr-4 font-medium">In game</th>
                  <th className="pb-2 pr-4 font-medium">Hosted</th>
                  <th className="pb-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr key={party.id} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-4">
                      <p className="font-medium">{party.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {party.leaderUsername} · {party.visibility} ·{" "}
                        <span className="font-mono">{party.id.slice(-8)}</span>
                      </p>
                    </td>
                    <td className="py-2 pr-4">
                      <p>{party.gameTitle || party.gameSlug || "—"}</p>
                      {party.gameSlug ? (
                        <p className="font-mono text-xs text-muted-foreground">{party.gameSlug}</p>
                      ) : null}
                    </td>
                    <td className={`py-2 pr-4 capitalize ${statusTone(party.status)}`}>
                      {party.status}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {party.memberCount}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        ({party.readyCount} ready)
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{party.inGameCount}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{hostedLabel(party)}</td>
                    <td className="py-2 text-xs text-muted-foreground"><LocalTime value={party.lastActivity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : (
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Servers currently running</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Dedicated processes on the VPS right now — every active game-host room, party-backed or not.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums">{data?.rooms?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {data?.health?.maxRooms != null
                ? `of ${data.health.maxRooms} slots`
                : "rooms"}
            </p>
          </div>
        </div>
        {data?.roomsError ? (
          <p className="mb-3 text-sm text-amber-400">VPS rooms: {data.roomsError}</p>
        ) : null}
        {!data?.configured ? (
          <p className="text-sm text-muted-foreground">Connect is not configured — no VPS rooms to list.</p>
        ) : (data.rooms?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No dedicated servers running on the VPS right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Game</th>
                  <th className="pb-2 pr-4 font-medium">Address</th>
                  <th className="pb-2 pr-4 font-medium">Party</th>
                  <th className="pb-2 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {(data.rooms || []).map((room) => (
                  <tr key={room.roomId} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-4">
                      <p className="font-medium">{room.name || "—"}</p>
                      <p className="font-mono text-xs text-muted-foreground">{room.roomId.slice(-10)}</p>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{room.gameSlug}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {room.host}:{room.port}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {room.partyId ? room.partyId.slice(-8) : "—"}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {room.createdAt ? (
                        <LocalTime value={new Date(room.createdAt).toISOString()} />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {isServers && !data?.configured ? null : isServers ? (
        <>
          {!metrics && agentOutdated ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <p className="font-semibold">Restore VPS usage stats</p>
              <p className="mt-1 text-muted-foreground">
                The game-host agent on your VPS is missing the <code className="text-xs">/metrics</code>{" "}
                endpoint. Health, rooms, and spawn tests may still work — CPU, memory, disk, and bandwidth
                require a one-time refresh after pulling latest code.
              </p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 font-mono text-xs text-muted-foreground">
                <li>cd /opt/playbound &amp;&amp; git fetch origin &amp;&amp; git reset --hard origin/main</li>
                <li>cd platform/game-host &amp;&amp; sudo bash install.sh</li>
                <li>sudo systemctl restart playbound-game-host</li>
              </ol>
            </div>
          ) : null}

          {metrics ? (
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
          ) : null}

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Dedicated games on VPS</h2>
              <p className="text-xs text-muted-foreground">
                Green/red dot = last spawn test · install icon = files on disk · client vs server
                version on each card
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.games ?? []).map((game) => {
                const Icon = game.ready ? CheckCircle2 : game.installed ? AlertTriangle : XCircle;
                const tone = game.ready
                  ? "text-emerald-400"
                  : game.installed
                    ? "text-amber-400"
                    : "text-red-400";
                const spawnEntry = data?.lastSpawnTest?.[game.slug];
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
                      <p
                        className={`mt-0.5 text-xs ${
                          game.versionMismatch ? "text-amber-400" : "text-muted-foreground"
                        }`}
                        title={
                          game.serverVersionSource === "detected"
                            ? "Server version probed on the VPS"
                            : "Server version from install.sh pin (re-run install to refresh probe)"
                        }
                      >
                        Client {game.clientVersion} · Server {game.serverVersion}
                        {game.versionMismatch ? " · mismatch" : ""}
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
      ) : null}
    </div>
  );
}
