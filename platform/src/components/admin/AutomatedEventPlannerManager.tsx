"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Gamepad2,
  Layers,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Save,
  Send,
  Server,
  Sparkles,
  Square,
  VolumeX,
} from "lucide-react";

type EditionItem = {
  slug: string;
  name: string;
  shortDescription?: string;
};

type CandidateGame = {
  slug: string;
  title: string;
  coverImage?: string | null;
  editions?: EditionItem[];
};

type GamePoolItem = {
  slug: string;
  editionSlug?: string | null;
  editionName?: string | null;
  enabled: boolean;
  durationHours: number;
  weight: number;
};

type ActiveSession = {
  roomId?: string | null;
  gameSlug?: string | null;
  editionSlug?: string | null;
  gameTitle?: string | null;
  partyId?: string | null;
  host?: string | null;
  port?: number | null;
  eventId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status: "idle" | "scheduled" | "live";
};

type MatchConfig = {
  enabled: boolean;
  frequencyHours: number;
  leadTimeMinutes: number;
  defaultDurationHours: number;
  games: GamePoolItem[];
  discord: {
    webhookUrl?: string | null;
    customTitle?: string | null;
    customMessage?: string | null;
  };
  activeSession?: ActiveSession;
  lastTriggeredAt?: string | null;
};

type MatchLog = {
  _id: string;
  gameSlug: string;
  gameTitle?: string;
  roomId?: string;
  host?: string;
  port?: number;
  startedAt: string;
  endsAt?: string;
  stoppedAt?: string;
  durationMinutes?: number;
  status: "completed" | "force_stopped" | "failed";
  error?: string;
};

export function AutomatedEventPlannerManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [config, setConfig] = useState<MatchConfig | null>(null);
  const [candidateGames, setCandidateGames] = useState<CandidateGame[]>([]);
  const [logs, setLogs] = useState<MatchLog[]>([]);
  const [hostConfigured, setHostConfigured] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch("/api/admin/connect/automated-events");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (isSilent) {
        // On background refresh, only update live status, active session, and logs to avoid clobbering unsaved form inputs
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                activeSession: data.config?.activeSession,
                lastTriggeredAt: data.config?.lastTriggeredAt,
              }
            : data.config
        );
      } else {
        setConfig(data.config);
      }
      setCandidateGames(data.candidateGames || []);
      setLogs(data.logs || []);
      setHostConfigured(Boolean(data.hostConfigured));
    } catch (err) {
      if (!isSilent) {
        setBanner({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to load automated event planner config",
        });
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Silent periodic refresh for countdown timers (without unmounting the UI)
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        config?.activeSession?.status === "live" ||
        config?.activeSession?.status === "scheduled"
      ) {
        loadData(true);
      }
    }, 20_000);
    return () => clearInterval(timer);
  }, [config?.activeSession?.status, loadData]);

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      setBanner(null);
      const res = await fetch("/api/admin/connect/automated-events", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: config.enabled,
          frequencyHours: config.frequencyHours,
          leadTimeMinutes: config.leadTimeMinutes,
          defaultDurationHours: config.defaultDurationHours,
          games: config.games,
          discord: config.discord,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data.config);
      setBanner({ type: "success", text: "Automated Event Planner configuration saved successfully." });
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save configuration",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async (
    gameSlugOverride?: string,
    editionSlugOverride?: string,
    leadMinutesOverride?: number
  ) => {
    try {
      setActionLoading(gameSlugOverride || "trigger-random");
      setBanner(null);
      const res = await fetch("/api/admin/connect/automated-events/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          force: true,
          gameSlugOverride,
          editionSlugOverride,
          leadMinutesOverride,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.reason || `Trigger failed (HTTP ${res.status})`);
      }

      await loadData(true);
      if (data.session?.status === "scheduled") {
        setBanner({
          type: "success",
          text: `Upcoming Game Night scheduled for ${data.session.gameTitle}! Advance announcement sent to Discord.`,
        });
      } else {
        setBanner({
          type: "success",
          text: `Dedicated match server successfully spun up for ${data.session?.gameTitle || "game"}!`,
        });
      }
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to trigger event",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    try {
      setActionLoading("stop");
      setBanner(null);
      const res = await fetch("/api/admin/connect/automated-events/trigger", {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Stop failed (HTTP ${res.status})`);
      }

      await loadData(true);
      setBanner({ type: "success", text: "Active event server stopped and room cleaned up." });
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to stop server",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestDiscord = async () => {
    if (!config?.discord?.webhookUrl) return;
    try {
      setActionLoading("discord-test");
      setBanner(null);
      const res = await fetch("/api/admin/connect/automated-events/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ testDiscordOnly: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Discord test failed");
      }
      setBanner({ type: "success", text: "Test announcement sent to Discord successfully!" });
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to send test announcement",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const togglePoolGame = (slug: string, editionSlug?: string | null, editionName?: string | null) => {
    if (!config) return;
    const existingIndex = config.games.findIndex(
      (g) => g.slug === slug && (editionSlug ? g.editionSlug === editionSlug : !g.editionSlug)
    );

    let newGames: GamePoolItem[];
    if (existingIndex >= 0) {
      newGames = config.games.map((g, idx) =>
        idx === existingIndex ? { ...g, enabled: !g.enabled } : g
      );
    } else {
      newGames = [
        ...config.games,
        {
          slug,
          editionSlug: editionSlug || null,
          editionName: editionName || null,
          enabled: true,
          durationHours: config.defaultDurationHours || 2,
          weight: 1,
        },
      ];
    }
    setConfig({ ...config, games: newGames });
  };

  const updatePoolDuration = (
    slug: string,
    duration: number,
    editionSlug?: string | null,
    editionName?: string | null
  ) => {
    if (!config) return;
    const existing = config.games.find(
      (g) => g.slug === slug && (editionSlug ? g.editionSlug === editionSlug : !g.editionSlug)
    );

    let newGames: GamePoolItem[];
    if (existing) {
      newGames = config.games.map((g) =>
        g.slug === slug && (editionSlug ? g.editionSlug === editionSlug : !g.editionSlug)
          ? { ...g, durationHours: duration }
          : g
      );
    } else {
      newGames = [
        ...config.games,
        {
          slug,
          editionSlug: editionSlug || null,
          editionName: editionName || null,
          enabled: true,
          durationHours: duration,
          weight: 1,
        },
      ];
    }
    setConfig({ ...config, games: newGames });
  };

  if (loading && !config) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <span>Loading Automated Event Planner settings...</span>
      </div>
    );
  }

  if (!config) return null;

  const isLive = config.activeSession?.status === "live";
  const isScheduled = config.activeSession?.status === "scheduled";

  const sessionEndsAt = config.activeSession?.endsAt
    ? new Date(config.activeSession.endsAt)
    : null;
  const sessionStartsAt = config.activeSession?.startsAt
    ? new Date(config.activeSession.startsAt)
    : null;

  const remainingMs = sessionEndsAt ? sessionEndsAt.getTime() - Date.now() : 0;
  const remainingMins = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
  const remainingHours = Math.floor(remainingMins / 60);
  const remainingMinsRemainder = remainingMins % 60;

  const startsInMs = sessionStartsAt ? sessionStartsAt.getTime() - Date.now() : 0;
  const startsInMins = Math.max(0, Math.ceil(startsInMs / (60 * 1000)));
  const startsInHours = Math.floor(startsInMins / 60);
  const startsInMinsRemainder = startsInMins % 60;

  return (
    <div className="space-y-8">
      {/* Banner */}
      {banner && (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl border p-4 text-sm ${
            banner.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Master Action Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/60 p-6 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calendar className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight">Automated Event Planner</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  config.enabled
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    config.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"
                  }`}
                />
                {config.enabled ? "Active / Scheduling" : "Disabled"}
              </span>
              {!hostConfigured && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                  Game Host VPS Disconnected
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatically schedules community game nights, provisions dedicated servers, and announces pop-up events in Discord.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => loadData(false)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => handleTrigger()}
            disabled={actionLoading !== null || !hostConfigured}
            className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            {actionLoading === "trigger-random" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4 text-primary" />
            )}
            Force Trigger Now
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Settings
          </button>
        </div>
      </div>

      {/* Scheduled Event Widget */}
      {isScheduled && config.activeSession && (
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/40 bg-gradient-to-r from-blue-950/40 via-card to-card p-6 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex size-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full size-2.5 bg-blue-500"></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  Upcoming Game Night Scheduled
                </span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight">
                {config.activeSession.gameTitle || config.activeSession.gameSlug}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Starts: {sessionStartsAt ? sessionStartsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Soon"}
                </span>
                {config.activeSession.eventId && (
                  <Link
                    href={`/events/${config.activeSession.eventId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    View Community Event Page <ExternalLink className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-center">
                <div className="text-xs text-blue-300">Server Starts In</div>
                <div className="text-lg font-bold text-foreground">
                  {startsInHours > 0 ? `${startsInHours}h ` : ""}{startsInMinsRemainder}m
                </div>
              </div>
              <button
                onClick={() =>
                  handleTrigger(
                    config.activeSession?.gameSlug || undefined,
                    config.activeSession?.editionSlug || undefined,
                    0
                  )
                }
                disabled={actionLoading !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Play className="size-4 fill-current" />
                Start Server Now
              </button>
              <button
                onClick={handleStop}
                disabled={actionLoading === "stop"}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                {actionLoading === "stop" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                Cancel Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Server Widget */}
      {isLive && config.activeSession && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-card to-card p-6 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex size-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Dedicated Event Server Live
                </span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight">
                {config.activeSession.gameTitle || config.activeSession.gameSlug}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="font-mono">
                  Host: <span className="text-foreground">{config.activeSession.host}:{config.activeSession.port}</span> • Room: {config.activeSession.roomId}
                </span>
                {config.activeSession.eventId && (
                  <Link
                    href={`/events/${config.activeSession.eventId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    View Event <ExternalLink className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="rounded-xl border border-border/80 bg-card/80 px-4 py-2 text-center">
                <div className="text-xs text-muted-foreground">Time Remaining</div>
                <div className="text-lg font-bold text-foreground">
                  {remainingHours}h {remainingMinsRemainder}m
                </div>
              </div>
              <button
                onClick={handleStop}
                disabled={actionLoading === "stop"}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                {actionLoading === "stop" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                Stop Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Automation Schedule Controls */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Schedule & Rules Card */}
        <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-6">
          <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
            <Clock className="size-5 text-primary" />
            <h3 className="font-semibold tracking-tight text-foreground">Automated Scheduling Rules</h3>
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-medium text-foreground">Planner Master Switch</label>
                <p className="text-xs text-muted-foreground">
                  Enable or pause the background automated scheduler.
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="size-5 rounded border-border text-primary focus:ring-primary"
              />
            </div>

            <div>
              <label className="font-medium text-foreground">Advance Schedule Lead Time</label>
              <p className="text-xs text-muted-foreground">
                How far in advance the event is scheduled and announced in Discord before the server starts.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {[
                  { label: "Instant (0m)", value: 0 },
                  { label: "30 Mins", value: 30 },
                  { label: "1 Hour", value: 60 },
                  { label: "2 Hours", value: 120 },
                  { label: "4 Hours", value: 240 },
                  { label: "12 Hours", value: 720 },
                  { label: "24 Hours", value: 1440 },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setConfig({ ...config, leadTimeMinutes: preset.value })}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      config.leadTimeMinutes === preset.value
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "border border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-medium text-foreground">Event Frequency (Hours)</label>
              <p className="text-xs text-muted-foreground">
                Minimum cooldown between automatically scheduled pop-up matches.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={config.frequencyHours}
                  onChange={(e) =>
                    setConfig({ ...config, frequencyHours: Math.max(1, Number(e.target.value)) })
                  }
                  className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  (e.g., 12 = two pop-up events per day)
                </span>
              </div>
            </div>

            <div>
              <label className="font-medium text-foreground">Default Match Duration (Hours)</label>
              <p className="text-xs text-muted-foreground">
                How long the dedicated server stays active before automatic teardown.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={config.defaultDurationHours}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      defaultDurationHours: Math.max(0.5, Number(e.target.value)),
                    })
                  }
                  className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                />
                <span className="text-xs text-muted-foreground">hours per server session</span>
              </div>
            </div>
          </div>
        </div>

        {/* Discord Silent Webhook Card */}
        <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div className="flex items-center gap-2.5">
              <VolumeX className="size-5 text-indigo-400" />
              <h3 className="font-semibold tracking-tight text-foreground">Discord Announcements</h3>
            </div>
            <button
              onClick={handleTestDiscord}
              disabled={actionLoading === "discord-test" || !config.discord?.webhookUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-40"
            >
              {actionLoading === "discord-test" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Send className="size-3" />
              )}
              Test Preview
            </button>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <label className="font-medium text-foreground">Webhook URL</label>
              <p className="text-xs text-muted-foreground">
                Post embed to your Discord #announcements or #events channel.
              </p>
              <input
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                value={config.discord?.webhookUrl || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    discord: { ...config.discord, webhookUrl: e.target.value },
                  })
                }
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="font-medium text-foreground">Custom Embed Title</label>
              <input
                type="text"
                placeholder="⚡ Pop-Up Game Night Live"
                value={config.discord?.customTitle || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    discord: { ...config.discord, customTitle: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="font-medium text-foreground">Custom Message Blurb</label>
              <textarea
                rows={2}
                placeholder="A dedicated match server has been spun up! Click below to auto-install & join."
                value={config.discord?.customMessage || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    discord: { ...config.discord, customMessage: e.target.value },
                  })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Rotation Pool Cards */}
      <div className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-tight">Candidate Games & Editions</h3>
            <p className="text-sm text-muted-foreground">
              Toggle which published games and standalone editions the planner will select for scheduled community events.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {config.games.filter((g) => g.enabled).length} games/editions enabled in rotation
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {candidateGames.map((game) => {
            const baseConfig = config.games.find((g) => g.slug === game.slug && !g.editionSlug);
            const isBaseEnabled = Boolean(baseConfig?.enabled);
            const baseDuration = baseConfig?.durationHours ?? config.defaultDurationHours ?? 2;

            return (
              <div
                key={game.slug}
                className={`flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                  isBaseEnabled
                    ? "border-primary/50 bg-card shadow-sm"
                    : "border-border/60 bg-card/40 opacity-75 hover:opacity-100"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {game.coverImage ? (
                        <div className="relative size-12 overflow-hidden rounded-xl border border-border shrink-0 bg-secondary">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={game.coverImage}
                            alt={game.title}
                            className="size-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                          <Gamepad2 className="size-6" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-semibold text-foreground">{game.title}</h4>
                        <span className="font-mono text-xs text-muted-foreground">
                          {game.slug}
                        </span>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={isBaseEnabled}
                      onChange={() => togglePoolGame(game.slug)}
                      className="size-5 rounded border-border text-primary focus:ring-primary"
                    />
                  </div>

                  {/* Editions Sub-List if available */}
                  {game.editions && game.editions.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Layers className="size-3" />
                        <span>Editions / Mods:</span>
                      </div>
                      <div className="space-y-1.5">
                        {game.editions.map((ed) => {
                          const edConfig = config.games.find(
                            (g) => g.slug === game.slug && g.editionSlug === ed.slug
                          );
                          const isEdEnabled = Boolean(edConfig?.enabled);
                          const edDuration = edConfig?.durationHours ?? baseDuration;

                          return (
                            <div
                              key={ed.slug}
                              className="flex items-center justify-between rounded-lg bg-secondary/40 px-2.5 py-1.5 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isEdEnabled}
                                  onChange={() => togglePoolGame(game.slug, ed.slug, ed.name)}
                                  className="size-3.5 rounded border-border text-primary"
                                />
                                <span className="font-medium text-foreground">{ed.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={edDuration}
                                  onChange={(e) =>
                                    updatePoolDuration(
                                      game.slug,
                                      Number(e.target.value),
                                      ed.slug,
                                      ed.name
                                    )
                                  }
                                  className="rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                                >
                                  <option value={1}>1h</option>
                                  <option value={1.5}>1.5h</option>
                                  <option value={2}>2h</option>
                                  <option value={3}>3h</option>
                                  <option value={4}>4h</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleTrigger(game.slug, ed.slug)}
                                  disabled={actionLoading !== null || !hostConfigured}
                                  className="text-primary hover:underline font-semibold"
                                >
                                  Trigger
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Duration:</span>
                    <select
                      value={baseDuration}
                      onChange={(e) =>
                        updatePoolDuration(game.slug, Number(e.target.value))
                      }
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      <option value={1}>1 Hour</option>
                      <option value={1.5}>1.5 Hours</option>
                      <option value={2}>2 Hours</option>
                      <option value={3}>3 Hours</option>
                      <option value={4}>4 Hours</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTrigger(game.slug)}
                    disabled={actionLoading !== null || !hostConfigured}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary/80 disabled:opacity-50"
                  >
                    {actionLoading === game.slug ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Play className="size-3 fill-current" />
                    )}
                    Trigger
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Match History Logs */}
      <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-6">
        <div className="flex items-center gap-2.5 border-b border-border/60 pb-4">
          <Activity className="size-5 text-primary" />
          <h3 className="font-semibold tracking-tight text-foreground">Recent Event History</h3>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No events have run yet. Enable the scheduler or click Force Trigger to launch your first pop-up match!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th className="py-2.5 font-medium">Event / Game</th>
                  <th className="py-2.5 font-medium">Server IP:Port</th>
                  <th className="py-2.5 font-medium">Triggered At</th>
                  <th className="py-2.5 font-medium">Duration</th>
                  <th className="py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-xs">
                {logs.map((log) => (
                  <tr key={log._id} className="hover:bg-secondary/30">
                    <td className="py-3 font-semibold text-foreground">
                      {log.gameTitle || log.gameSlug}
                    </td>
                    <td className="py-3 font-mono text-muted-foreground">
                      {log.host && log.port ? `${log.host}:${log.port}` : "—"}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(log.startedAt).toLocaleString()}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {log.durationMinutes ? `${log.durationMinutes} mins` : "—"}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          log.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : log.status === "failed"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {log.status === "completed"
                          ? "Completed"
                          : log.status === "failed"
                          ? "Failed"
                          : "Stopped"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
