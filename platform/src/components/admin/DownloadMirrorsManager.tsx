"use client";

import { useState, useEffect } from "react";
import { LauncherReleaseUploader } from "./LauncherReleaseUploader";
import { LocalTime } from "@/components/LocalTime";
import {
  DownloadCloud,
  HardDrive,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  ShieldAlert,
  ArrowUpRight,
  Trash2,
  RefreshCw,
  Sliders,
  Eye,
  Search,
  Activity,
  Layers,
  Database,
  Info,
  Flame,
  Archive,
  Network,
} from "lucide-react";

function formatDataVolume(bytes: number) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

interface OverviewData {
  r2StorageGB: number;
  r2BudgetGB: number;
  r2UtilizationPercent: number;
  r2ObjectsCount: number;
  totalArtifactsCount: number;
  vpsUsedGB: number;
  vpsAllocatedGB: number;
  vpsFreeGB: number;
  vpsBandwidthServedBytes: number;
  vpsBandwidthServedGB: number;
  r2BandwidthServedBytes?: number;
  r2BandwidthServedGB?: number;
  publicBandwidthServedBytes?: number;
  publicBandwidthServedGB?: number;
  totalBandwidthServedBytes?: number;
  totalBandwidthServedGB?: number;
  vpsFilesystemUsedGB: number | null;
  vpsFilesystemTotalGB: number | null;
  vpsFilesystemUsedPercent: number | null;
  vpsMetricsAvailable: boolean;
  publicMirrorsCount: number;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  r2HealthPercent: number;
  vpsHealthPercent: number;
  lastMirrorScan: string;
}

interface ProjectionData {
  pendingPromotionGB: number;
  potentialEvictionGB: number;
  projectedUsageGB: number;
}

interface CostEstimates {
  currentStorageGB: number;
  estimatedGbMonth: number;
  classAOperations: number;
  classBOperations: number;
}

interface CacheItem {
  id: string;
  gameSlug: string | null;
  version: string;
  artifactType: string;
  filename: string;
  sizeBytes: number;
  score: number;
  downloads: number;
  recentDownloads: number;
  r2Status: string;
  r2Protected: boolean;
  r2Disabled: boolean;
  vpsStatus: string;
  vpsStatusMessage: string | null;
  lastPromoted: string | null;
  lastEvicted: string | null;
  publicHealth: string;
  sha256: string;
  archiveSourceUrl: string | null;
}

interface SourceItem {
  sourceId: string;
  artifactId: string;
  gameSlug: string | null;
  filename: string;
  sourceType: string;
  url: string;
  healthStatus: "healthy" | "degraded" | "failing" | "offline" | "unknown";
  enabled: boolean;
  priority: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  checksumFailureCount: number;
  successRate: number;
  averageDownloadSpeed: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  r2Cached: boolean;
}

interface AlertItem {
  type: "warning" | "error" | "info";
  title: string;
  message: string;
}

interface SettingsData {
  r2MonthlyBudgetGB: number;
  r2WarningThreshold: number;
  r2MinFreeBudgetGB: number;
  r2MinRetentionHours: number;
  autoPromotion: boolean;
  autoEviction: boolean;
  maxR2ArtifactSizeGB: number;
  vpsStorageLimitGB: number;
}

interface ArtifactDetail {
  artifact: {
    artifactId: string;
    gameSlug: string | null;
    version: string;
    artifactType: string;
    filename: string;
    relativePath: string;
    sizeBytes: number;
    sha256: string;
    licenseStatus: string;
    vpsStatus: string;
    r2Status: string;
    r2PromotionScore: number;
    r2Protected: boolean;
    totalDownloads: number;
    recentDownloads: number;
    r2LastPromoted: string | null;
  };
  sources: SourceItem[];
  scoreBreakdown: {
    reliabilityProblem: number;
    demandScore: number;
    recentDemandScore: number;
    failureFrequencyScore: number;
    speedPenalty: number;
    sizePenalty: number;
    inactivityPenalty: number;
    totalScore: number;
  };
  recentAttempts: Array<{
    sourceType: string;
    result: string;
    downloadSpeed: number;
    bytesDownloaded: number;
    attemptedAt: string;
  }>;
  recentEvents: Array<{
    eventType: string;
    actor: string;
    details: string;
    createdAt: string;
  }>;
}

export function DownloadMirrorsManager() {
  const [activeTab, setActiveTab] = useState<"cache" | "sources" | "config" | "events">("cache");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [projections, setProjections] = useState<ProjectionData | null>(null);
  const [costEstimates, setCostEstimates] = useState<CostEstimates | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);

  const [cacheItems, setCacheItems] = useState<CacheItem[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [events, setEvents] = useState<Array<{ eventType: string; actor: string; details: string; createdAt: string }>>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactDetail, setArtifactDetail] = useState<ArtifactDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Settings form local state
  const [budgetInput, setBudgetInput] = useState("8.0");
  const [warningThreshold, setWarningThreshold] = useState("90");
  const [minRetentionHours, setMinRetentionHours] = useState("24");
  const [autoPromotion, setAutoPromotion] = useState(true);
  const [autoEviction, setAutoEviction] = useState(true);
  /** How many demo rows from the old seeder are still present; 0 hides the button. */
  const [seededCount, setSeededCount] = useState(0);

  async function loadData() {
    try {
      setLoading(true);
      const [ovRes, cacheRes, srcRes, evtRes, seededRes] = await Promise.all([
        fetch("/api/admin/download-mirrors/overview"),
        fetch("/api/admin/download-mirrors/cache"),
        fetch("/api/admin/download-mirrors/sources"),
        fetch("/api/admin/download-mirrors/events"),
        fetch("/api/admin/download-mirrors/cache/clear-seeded"),
      ]);

      if (seededRes.ok) {
        const seeded = await seededRes.json();
        setSeededCount(Array.isArray(seeded.artifacts) ? seeded.artifacts.length : 0);
      }

      if (ovRes.ok) {
        const ovData = await ovRes.json();
        setOverview(ovData.overview);
        setProjections(ovData.projections);
        setCostEstimates(ovData.costEstimates);
        setAlerts(ovData.alerts || []);
        if (ovData.settings) {
          setSettings(ovData.settings);
          setBudgetInput(String(ovData.settings.r2MonthlyBudgetGB));
          setWarningThreshold(String(ovData.settings.r2WarningThreshold));
          setMinRetentionHours(String(ovData.settings.r2MinRetentionHours));
          setAutoPromotion(ovData.settings.autoPromotion);
          setAutoEviction(ovData.settings.autoEviction);
        }
      }

      if (cacheRes.ok) {
        const cData = await cacheRes.json();
        setCacheItems(cData.items || []);
      }

      if (srcRes.ok) {
        const sData = await srcRes.json();
        setSources(sData.sources || []);
      }

      if (evtRes.ok) {
        const eData = await evtRes.json();
        setEvents(eData.events || []);
      }
    } catch (err) {
      console.error("Error loading mirror data:", err);
      setMessage({ text: "Failed to load mirror data", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction("settings");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/download-mirrors/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          r2MonthlyBudgetGB: parseFloat(budgetInput),
          r2WarningThreshold: parseInt(warningThreshold, 10),
          r2MinRetentionHours: parseInt(minRetentionHours, 10),
          autoPromotion,
          autoEviction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update settings");

      setMessage({ text: "Settings saved successfully & cache rebalanced!", type: "success" });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving settings";
      setMessage({ text: msg, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePromote(artifactId: string) {
    setBusyAction(`promote-${artifactId}`);
    try {
      const res = await fetch("/api/admin/download-mirrors/cache/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Promotion failed");
      setMessage({ text: data.message, type: "success" });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Promotion failed";
      setMessage({ text: msg, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * One-time cleanup of the rows the old demo seeder wrote.
   *
   * Lives here rather than only in a script because the cleanup has to be
   * runnable without a dev environment. The button hides itself once there is
   * nothing left to clear, so it does not become permanent furniture.
   */
  async function handleClearSeeded() {
    if (
      !confirm(
        "Remove the demo artifacts the old seeder created?\n\n" +
          "These carry invented download counts (842, 620, 512…) that are mixed in " +
          "with real ones. Artifacts registered by real downloads are not affected.\n\n" +
          "This cannot be undone."
      )
    ) {
      return;
    }
    setBusyAction("clear-seeded");
    try {
      const res = await fetch("/api/admin/download-mirrors/cache/clear-seeded", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not clear demo rows");
      setMessage({ text: data.message, type: "success" });
      setSeededCount(0);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not clear demo rows";
      setMessage({ text: msg, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePruneOld() {
    if (!confirm("Clean out old/superseded versions from the database? Only current active install files will be retained.")) return;
    setBusyAction("prune-old");
    try {
      const res = await fetch("/api/admin/download-mirrors/cache/prune-old", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not clean old versions");
      setMessage({ text: data.message, type: "success" });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not clean old versions";
      setMessage({ text: msg, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEvict(artifactId: string) {
    if (!confirm("Are you sure you want to evict this artifact from R2? The authoritative VPS archive will be preserved.")) return;
    setBusyAction(`evict-${artifactId}`);
    try {
      const res = await fetch("/api/admin/download-mirrors/cache/evict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eviction failed");
      setMessage({ text: data.message, type: "success" });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Eviction failed";
      setMessage({ text: msg, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleArchive(item: CacheItem) {
    const { id: artifactId, archiveSourceUrl: sourceUrl } = item;
    setBusyAction(`archive-${artifactId}`);
    setCacheItems((items) => items.map((item) => item.id === artifactId
      ? { ...item, vpsStatus: "uploading", vpsStatusMessage: "Starting VPS transfer…" }
      : item));
    try {
      const res = await fetch("/api/admin/download-mirrors/cache/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactId,
          sourceUrl: sourceUrl || null,
          artifact: {
            gameSlug: item.gameSlug,
            version: item.version,
            filename: item.filename,
            sizeBytes: item.sizeBytes,
            artifactType: item.artifactType,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Archive failed");
      setMessage({ text: data.message, type: "success" });
      await loadData();
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "Archive failed";
      setCacheItems((items) => items.map((item) => item.id === artifactId
        ? { ...item, vpsStatus: "missing", vpsStatusMessage: detail }
        : item));
      setMessage({ text: detail, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteArtifact(artifactId: string) {
    if (!confirm("Delete this artifact and its R2/VPS copies?\n\nThis removes only the artifact, download-source, attempt, and job records. It never changes game catalog data.")) return;
    setBusyAction(`delete-${artifactId}`);
    try {
      const res = await fetch(`/api/admin/download-mirrors/artifacts/${encodeURIComponent(artifactId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Delete failed");
      setMessage({ text: data.message, type: "success" });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Delete failed", type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleProtect(artifactId: string, currentProtected: boolean) {
    setBusyAction(`protect-${artifactId}`);
    try {
      const res = await fetch("/api/admin/download-mirrors/cache/protect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId, protect: !currentProtected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Protection toggle failed");
      setMessage({ text: data.message, type: "success" });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Protection failed";
      setMessage({ text: msg, type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function openArtifactDetails(id: string) {
    setSelectedArtifactId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/download-mirrors/artifacts/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setArtifactDetail(data);
      }
    } catch (err) {
      console.error("Failed to load artifact details", err);
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredCacheItems = cacheItems.filter((i) => {
    const q = searchQuery.toLowerCase();
    return i.id.toLowerCase().includes(q) || i.filename.toLowerCase().includes(q) || (i.gameSlug && i.gameSlug.toLowerCase().includes(q));
  });

  const filteredSources = sources.filter((s) => {
    if (sourceFilter === "healthy" && s.healthStatus !== "healthy") return false;
    if (sourceFilter === "degraded" && s.healthStatus !== "degraded") return false;
    if (sourceFilter === "failing" && (s.healthStatus !== "failing" && s.healthStatus !== "offline")) return false;
    if (sourceFilter === "r2" && !s.r2Cached) return false;
    const q = searchQuery.toLowerCase();
    return s.sourceId.toLowerCase().includes(q) || s.artifactId.toLowerCase().includes(q) || s.url.toLowerCase().includes(q);
  });

  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1) + " MB";
  const formatSpeed = (bytesPerSec: number) =>
    bytesPerSec >= 1024 * 1024 ? (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s" : (bytesPerSec / 1024).toFixed(0) + " KB/s";

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
              : "bg-rose-950/40 border-rose-500/30 text-rose-400"
          }`}
        >
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alt, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                alt.type === "error"
                  ? "bg-rose-950/40 border-rose-500/30 text-rose-300"
                  : "bg-amber-950/40 border-amber-500/30 text-amber-300"
              }`}
            >
              {alt.type === "error" ? <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" /> : <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />}
              <div>
                <h4 className="font-semibold text-sm">{alt.title}</h4>
                <p className="text-xs opacity-90 mt-0.5">{alt.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top Overview Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Card 1: R2 Storage & Budget Gauge */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 relative overflow-hidden shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-purple-400" /> R2 Hot Cache
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {overview.r2UtilizationPercent}%
              </span>
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {overview.r2StorageGB}{" "}
                <span className="text-sm font-medium text-muted-foreground">/ {overview.r2BudgetGB} GB</span>
              </div>
              <div className="w-full bg-secondary/60 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    overview.r2UtilizationPercent > 90 ? "bg-rose-500" : overview.r2UtilizationPercent > 75 ? "bg-amber-500" : "bg-purple-500"
                  }`}
                  style={{ width: `${overview.r2UtilizationPercent}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>{overview.r2ObjectsCount} objects cached</span>
              <span>{(overview.r2BudgetGB - overview.r2StorageGB).toFixed(2)} GB free</span>
            </div>
          </div>

          {/* Card 2: VPS Archive */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-blue-400" /> VPS Archive
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {overview.vpsHealthPercent}% Verified
              </span>
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {overview.vpsUsedGB}{" "}
                <span className="text-sm font-medium text-muted-foreground">/ {overview.vpsAllocatedGB} GB</span>
              </div>
              <div className="w-full bg-secondary/60 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((overview.vpsUsedGB / overview.vpsAllocatedGB) * 100))}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>Authoritative Archive</span>
              <span>{overview.vpsFreeGB} GB free</span>
            </div>
          </div>

          {/* Card 3: Multi-tier Data Transfer & Bandwidth Served */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Network className="w-4 h-4 text-cyan-400" /> Data Transfer
              </span>
              {overview.vpsFilesystemUsedPercent != null ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  FS {overview.vpsFilesystemUsedPercent}%
                </span>
              ) : null}
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {formatDataVolume(overview.totalBandwidthServedBytes ?? overview.vpsBandwidthServedBytes ?? 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Total lifetime egress across all delivery tiers
              </p>
            </div>

            {/* Individual Tier Breakdown */}
            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-center">
                <div className="text-[11px] font-semibold text-blue-400 truncate">VPS Archive</div>
                <div className="text-xs font-black text-blue-300 mt-0.5">
                  {formatDataVolume(overview.vpsBandwidthServedBytes ?? 0)}
                </div>
              </div>
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-center">
                <div className="text-[11px] font-semibold text-purple-400 truncate">R2 Cache</div>
                <div className="text-xs font-black text-purple-300 mt-0.5">
                  {formatDataVolume(overview.r2BandwidthServedBytes ?? 0)}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
                <div className="text-[11px] font-semibold text-emerald-400 truncate">Public</div>
                <div className="text-xs font-black text-emerald-300 mt-0.5">
                  {formatDataVolume(overview.publicBandwidthServedBytes ?? 0)}
                </div>
              </div>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>
                {overview.vpsFilesystemUsedGB != null && overview.vpsFilesystemTotalGB != null
                  ? `${overview.vpsFilesystemUsedGB} / ${overview.vpsFilesystemTotalGB} GB on disk`
                  : overview.vpsMetricsAvailable
                    ? "Filesystem stats unavailable"
                    : "Live FS stats need updated VPS agent"}
              </span>
              <span>
                {(overview.totalBandwidthServedGB ?? overview.vpsBandwidthServedGB ?? 0).toFixed(2)} GB logged
              </span>
            </div>
          </div>

          {/* Card 4: Public Mirror Health Matrix */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <DownloadCloud className="w-4 h-4 text-emerald-400" /> Public Mirrors
              </span>
              <span className="text-xs font-bold text-foreground">{overview.publicMirrorsCount} Sources</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
                <div className="text-xs text-emerald-400 font-medium">Healthy</div>
                <div className="text-lg font-bold text-emerald-300">{overview.healthyCount}</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-center">
                <div className="text-xs text-amber-400 font-medium">Degraded</div>
                <div className="text-lg font-bold text-amber-300">{overview.degradedCount}</div>
              </div>
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2 text-center">
                <div className="text-xs text-rose-400 font-medium">Failed</div>
                <div className="text-lg font-bold text-rose-300">{overview.failedCount}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground text-center">
              Primary tier: zero bandwidth cost
            </div>
          </div>

          {/* Card 5: Cost & Projections */}
          {costEstimates && projections && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400" /> R2 Projected Usage
                </span>
                <span className="text-xs text-indigo-400 font-semibold">{projections.projectedUsageGB} GB</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Pending Promotions:</span>
                  <span className="font-semibold text-emerald-400">+{projections.pendingPromotionGB} GB</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Potential Evictions:</span>
                  <span className="font-semibold text-rose-400">-{projections.potentialEvictionGB} GB</span>
                </div>
                <div className="flex justify-between py-0.5 border-t border-border/60 pt-1">
                  <span className="text-muted-foreground">Est. Storage:</span>
                  <span className="font-semibold text-foreground">{costEstimates.estimatedGbMonth} GB-mo</span>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
                <Info className="w-3 h-3" /> Standard class • Free egress
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation Pills & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("cache")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === "cache"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
          >
            <Flame className="w-4 h-4" /> R2 Hot Cache ({cacheItems.length})
          </button>
          <button
            onClick={() => setActiveTab("sources")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === "sources"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
          >
            <DownloadCloud className="w-4 h-4" /> Public Sources ({sources.length})
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === "config"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
          >
            <Sliders className="w-4 h-4" /> Budget & Rules
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === "events"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
          >
            <Activity className="w-4 h-4" /> Audit Log ({events.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search artifacts or sources…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-secondary/30 text-sm focus:outline-none focus:border-ring"
            />
          </div>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="h-9 px-3 rounded-lg border border-border bg-secondary/40 hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-sm flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => void handlePruneOld()}
            disabled={loading || busyAction === "prune-old"}
            title="Clean out obsolete versions from the database, retaining only current active install files."
            className="h-9 px-3 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className={`w-3.5 h-3.5 ${busyAction === "prune-old" ? "animate-spin" : ""}`} /> Clean Old Versions
          </button>
        </div>
      </div>

      {/* TAB 1: R2 Hot Cache */}
      {activeTab === "cache" && (
        <div className="space-y-4">
          <LauncherReleaseUploader />
          <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm text-sky-100">
            <Archive className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <p>
              <span className="font-semibold">Archive to VPS</span> copies from R2 when available, otherwise from its approved public source. It does not change any game catalog data.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="p-4">Artifact / Game</th>
                    <th className="p-4">Size</th>
                    <th className="p-4">Cache Score</th>
                    <th className="p-4">Downloads</th>
                    <th className="p-4">Public Health</th>
                    <th className="p-4">R2 Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredCacheItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No artifacts matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCacheItems.map((item) => (
                      <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-foreground">{item.filename}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.gameSlug ? `Game: ${item.gameSlug}` : "Runtime"} • v{item.version}
                          </div>
                        </td>
                        <td className="p-4 text-foreground font-mono text-xs">{formatMB(item.sizeBytes)}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                                item.score >= 80
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                  : item.score >= 50
                                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {item.score}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-foreground font-semibold">{item.downloads}</div>
                          <div className="text-xs text-muted-foreground">+{item.recentDownloads} recent</div>
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                              item.publicHealth === "Good"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : item.publicHealth === "Poor"
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {item.publicHealth}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                                item.r2Status === "cached"
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                  : item.r2Status === "candidate"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {item.r2Status.replace("_", " ")}
                            </span>
                            {item.r2Protected && (
                              <span className="p-1 rounded bg-amber-500/10 text-amber-400" title="Protected from eviction">
                                <Shield className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => void openArtifactDetails(item.id)}
                              className="px-2.5 py-1 rounded bg-secondary/50 hover:bg-secondary text-xs font-medium transition-colors flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> Details
                            </button>
                            <button
                              onClick={() => void handleArchive(item)}
                              disabled={
                                busyAction === `archive-${item.id}` ||
                                item.vpsStatus === "verified" ||
                                item.vpsStatus === "uploading"
                              }
                              className="px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                              title={
                                item.vpsStatus === "verified"
                                  ? "Already archived on VPS"
                                  : item.vpsStatus === "uploading"
                                  ? "VPS archive transfer is in progress"
                                  : "Copy to VPS archive"
                              }
                            >
                              <Archive className="w-3.5 h-3.5" />
                              {item.vpsStatus === "verified"
                                ? "On VPS"
                                : busyAction === `archive-${item.id}`
                                ? "Starting…"
                                : item.vpsStatus === "uploading"
                                ? "Transferring…"
                                : "Archive to VPS"}
                            </button>
                            {item.vpsStatusMessage && (
                              <span
                                className={`max-w-52 text-[11px] leading-tight ${item.vpsStatus === "missing" ? "text-rose-300" : "text-sky-200"}`}
                                title={item.vpsStatusMessage}
                              >
                                {item.vpsStatusMessage}
                              </span>
                            )}
                            {item.r2Status === "cached" ? (
                              <>
                                <button
                                  onClick={() => void handleToggleProtect(item.id, item.r2Protected)}
                                  disabled={busyAction === `protect-${item.id}`}
                                  className={`p-1.5 rounded text-xs transition-colors ${
                                    item.r2Protected
                                      ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                                      : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                                  }`}
                                  title={item.r2Protected ? "Unprotect" : "Protect from auto eviction"}
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => void handleEvict(item.id)}
                                  disabled={busyAction === `evict-${item.id}`}
                                  className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition-colors"
                                  title="Force evict from R2"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => void handlePromote(item.id)}
                                disabled={busyAction === `promote-${item.id}`}
                                className="px-2.5 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-bold transition-colors flex items-center gap-1"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" /> Promote
                              </button>
                            )}
                            <button
                              onClick={() => void handleDeleteArtifact(item.id)}
                              disabled={busyAction === `delete-${item.id}`}
                              className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition-colors disabled:opacity-50"
                              title="Delete artifact and its mirror records"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Public Sources */}
      {activeTab === "sources" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filter Status:</span>
            {["all", "healthy", "degraded", "failing", "r2"].map((f) => (
              <button
                key={f}
                onClick={() => setSourceFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition-colors ${
                  sourceFilter === f ? "bg-primary text-primary-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="p-4">Artifact</th>
                    <th className="p-4">Source URL</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Success Rate</th>
                    <th className="p-4">Failures</th>
                    <th className="p-4">Avg Speed</th>
                    <th className="p-4">R2 Cached</th>
                    <th className="p-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredSources.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        No public sources matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredSources.map((src) => (
                      <tr key={src.sourceId} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4 font-semibold text-foreground">{src.filename}</td>
                        <td className="p-4 max-w-xs truncate font-mono text-xs text-muted-foreground" title={src.url}>
                          {src.url}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                              src.healthStatus === "healthy"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : src.healthStatus === "degraded"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {src.healthStatus}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-xs font-semibold text-foreground">{src.successRate}%</td>
                        <td className="p-4 text-xs font-mono text-muted-foreground">
                          {src.failureCount} <span className="opacity-60">({src.timeoutCount} timeouts)</span>
                        </td>
                        <td className="p-4 font-mono text-xs text-foreground">{formatSpeed(src.averageDownloadSpeed)}</td>
                        <td className="p-4">
                          {src.r2Cached ? (
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-xs">Yes</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => void openArtifactDetails(src.artifactId)}
                            className="px-2.5 py-1 rounded bg-secondary/50 hover:bg-secondary text-xs font-medium transition-colors"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Budget & Rules Config */}
      {activeTab === "config" && (
        <form onSubmit={handleSaveSettings} className="rounded-xl border border-border bg-card p-6 space-y-6 max-w-2xl shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-foreground">R2 Monthly Storage Budget & Cache Rules</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Configure the maximum R2 capacity the Mirror Intelligence engine is allowed to intentionally occupy. The system will automatically promote high-value artifacts and evict lower-value ones to remain under this target.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>R2 Monthly Storage Budget (GB)</span>
                <span className="text-purple-400 font-normal">Recommended default: 8.0 GB (10 GB free tier)</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="50"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm font-semibold text-foreground focus:outline-none focus:border-ring"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Warning Threshold (%)</label>
                <input
                  type="number"
                  min="50"
                  max="99"
                  value={warningThreshold}
                  onChange={(e) => setWarningThreshold(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground focus:outline-none focus:border-ring"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Min R2 Retention (Hours)</label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={minRetentionHours}
                  onChange={(e) => setMinRetentionHours(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground focus:outline-none focus:border-ring"
                  required
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/20 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-foreground">Automatic R2 Promotion</div>
                  <div className="text-xs text-muted-foreground">Automatically copy candidates from VPS to R2 when score threshold is reached.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoPromotion}
                  onChange={(e) => setAutoPromotion(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/20 cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-foreground">Automatic R2 Eviction</div>
                  <div className="text-xs text-muted-foreground">Automatically evict lowest-score unprotected items when higher-value objects need capacity.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoEviction}
                  onChange={(e) => setAutoEviction(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={busyAction === "settings"}
            className="w-full h-11 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
          >
            {busyAction === "settings" ? "Saving & Rebalancing…" : "Save Budget & Rebalance Cache"}
          </button>
        </form>
      )}

      {/*
        One-time cleanup, shown only while there is something to clean. The old
        seeder inserted five artifacts with invented download counts that sit
        indistinguishably beside real ones; this removes exactly those.
      */}
      {activeTab === "config" && seededCount > 0 && (
        <div className="mt-6 max-w-2xl rounded-xl border border-amber-500/40 bg-amber-500/5 p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <AlertTriangle className="size-5 text-amber-500" /> Demo data present
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {seededCount} artifact{seededCount === 1 ? "" : "s"} in this table came from the old
            seeder, not from real downloads. Their counts were invented — 842 for HoloCure, 620 for
            Warzone 2100 — and real downloads have been adding to those baselines, so the numbers
            cannot be read either way.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            The seeder is gone, so this cannot come back. Artifacts registered by real downloads are
            not affected.
          </p>
          <button
            type="button"
            onClick={handleClearSeeded}
            disabled={busyAction === "clear-seeded"}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-bold text-black transition-all hover:brightness-110 disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            {busyAction === "clear-seeded"
              ? "Clearing…"
              : `Clear ${seededCount} demo row${seededCount === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {/* TAB 4: Audit Log */}
      {activeTab === "events" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xl">
          <div className="p-4 border-b border-border bg-secondary/20">
            <h3 className="font-bold text-sm text-foreground">Administrative & Automation Audit Timeline</h3>
          </div>
          <div className="divide-y divide-border/60">
            {events.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No events recorded.</div>
            ) : (
              events.map((evt, idx) => (
                <div key={idx} className="p-4 flex items-start justify-between gap-4 hover:bg-secondary/10 transition-colors">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-foreground">{evt.details}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="capitalize font-mono px-1.5 py-0.5 rounded bg-secondary text-[10px]">
                        {evt.eventType.replace("_", " ")}
                      </span>
                      <span>By {evt.actor}</span>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground shrink-0">
                    <LocalTime value={evt.createdAt} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Artifact Detail Modal */}
      {selectedArtifactId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  {artifactDetail?.artifact.filename || selectedArtifactId}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ID: {selectedArtifactId} • v{artifactDetail?.artifact.version || "1.0"}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedArtifactId(null);
                  setArtifactDetail(null);
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                ✕
              </button>
            </div>

            {detailLoading || !artifactDetail ? (
              <div className="p-12 text-center text-muted-foreground">Loading artifact details…</div>
            ) : (
              <div className="space-y-6">
                {/* Status Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl border border-border bg-secondary/30 text-center">
                    <div className="text-xs text-muted-foreground font-semibold">Size</div>
                    <div className="text-sm font-bold text-foreground mt-1 font-mono">{formatMB(artifactDetail.artifact.sizeBytes)}</div>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-secondary/30 text-center">
                    <div className="text-xs text-muted-foreground font-semibold">R2 Status</div>
                    <div className="text-sm font-bold text-purple-400 mt-1 capitalize">{artifactDetail.artifact.r2Status}</div>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-secondary/30 text-center">
                    <div className="text-xs text-muted-foreground font-semibold">VPS Archive</div>
                    <div className="text-sm font-bold text-emerald-400 mt-1 capitalize">{artifactDetail.artifact.vpsStatus}</div>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-secondary/30 text-center">
                    <div className="text-xs text-muted-foreground font-semibold">Cache Score</div>
                    <div className="text-sm font-bold text-indigo-400 mt-1 font-mono">{artifactDetail.artifact.r2PromotionScore} / 100</div>
                  </div>
                </div>

                {/* Checksum */}
                <div className="p-3 rounded-xl border border-border bg-secondary/20 space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SHA-256 Checksum</span>
                  <div className="font-mono text-xs text-foreground select-all break-all">{artifactDetail.artifact.sha256}</div>
                </div>

                {/* Score Breakdown */}
                {artifactDetail.scoreBreakdown && (
                  <div className="rounded-xl border border-border p-4 space-y-3 bg-secondary/10">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">R2 Promotion Score Breakdown</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Reliability Problem:</span>
                        <div className="font-bold text-emerald-400">+{artifactDetail.scoreBreakdown.reliabilityProblem}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Download Demand:</span>
                        <div className="font-bold text-emerald-400">+{artifactDetail.scoreBreakdown.demandScore}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Recent Demand:</span>
                        <div className="font-bold text-emerald-400">+{artifactDetail.scoreBreakdown.recentDemandScore}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Public Speed Penalty:</span>
                        <div className="font-bold text-emerald-400">+{artifactDetail.scoreBreakdown.speedPenalty}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Size Penalty:</span>
                        <div className="font-bold text-rose-400">-{artifactDetail.scoreBreakdown.sizePenalty}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Inactivity Penalty:</span>
                        <div className="font-bold text-rose-400">-{artifactDetail.scoreBreakdown.inactivityPenalty}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sources List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Configured Download Sources</h4>
                  <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-card text-xs">
                    {artifactDetail.sources.map((s, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <span className="capitalize font-mono text-[10px] px-1.5 py-0.5 rounded bg-secondary">{s.sourceType}</span>
                            <span className="truncate">{s.url}</span>
                          </div>
                          <div className="text-muted-foreground mt-0.5 font-mono">
                            Success: {s.successCount} • Failures: {s.failureCount} • Speed: {formatSpeed(s.averageDownloadSpeed)}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] capitalize ${
                            s.healthStatus === "healthy" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {s.healthStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
