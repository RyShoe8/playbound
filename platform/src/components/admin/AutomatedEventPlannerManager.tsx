"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/connect/automated-events");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data.config);
      setCandidateGames(data.candidateGames || []);
      setLogs(data.logs || []);
      setHostConfigured(Boolean(data.hostConfigured));
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load automated event planner config",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic refresh for active session countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      if (config?.activeSession?.status === "live") {
        loadData();
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [config?.activeSession?.status, loadData]);

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      setBanner(null);
      const res = await fetch("/api/admin/connect/automated-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: config.enabled,
          frequencyHours: Number(config.frequencyHours) || 12,
          leadTimeMinutes: Number(config.leadTimeMinutes) || 0,
          defaultDurationHours: Number(config.defaultDurationHours) || 2,
          games: config.games,
          discord: config.discord,
        }),
      });
      if (!res.ok) throw new Error(`Failed to save: HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data.config);
      setBanner({ type: "success", text: "Settings saved successfully." });
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save settings",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async (gameSlug?: string, editionSlug?: string | null) => {
    const actionKey = editionSlug
      ? `trigger-${gameSlug}:${editionSlug}`
      : gameSlug
        ? `trigger-${gameSlug}`
        : "trigger-random";
    try {
      setActionLoading(actionKey);
      setBanner(null);
      const res = await fetch("/api/admin/connect/automated-events/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "trigger",
          gameSlug,
          editionSlug: editionSlug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.reason || data.error || `HTTP ${res.status}`);
      }
      setBanner({
        type: "success",
        text: `Pop-up event started for ${data.session?.gameTitle || data.session?.gameSlug}! Server is live at ${data.session?.host}:${data.session?.port}`,
      });
      await loadData();
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
    if (!confirm("Are you sure you want to stop the active pop-up match server immediately?")) {
      return;
    }
    try {
      setActionLoading("stop");
      setBanner(null);
      const res = await fetch("/api/admin/connect/automated-events/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setBanner({ type: "success", text: "Active pop-up server stopped and room cleaned up." });
      await loadData();
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
    try {
      setActionLoading("discord-test");
      setBanner(null);
      const res = await fetch("/api/admin/connect/automated-events/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test_discord" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setBanner({ type: "success", text: "Silent Discord announcement test dispatched successfully." });
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Discord test failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const toggleGameEnabled = (
    slug: string,
    editionSlug: string | null = null,
    editionName: string | null = null
  ) => {
    if (!config) return;
    const existing = config.games.find(
      (g) => g.slug === slug && (editionSlug ? g.editionSlug === editionSlug : !g.editionSlug)
    );
    let newGames: GamePoolItem[];
    if (existing) {
      newGames = config.games.map((g) =>
        g.slug === slug && (editionSlug ? g.editionSlug === editionSlug : !g.editionSlug)
          ? { ...g, enabled: !g.enabled }
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
          durationHours: config.defaultDurationHours || 2,
          weight: 1,
        },
      ];
    }
    setConfig({ ...config, games: newGames });
  };

  const updateGameDuration = (
    slug: string,
    duration: number,
    editionSlug: string | null = null,
    editionName: string | null = null
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

  if (loading || !config) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <span>Loading Automated Event Planner settings...</span>
      </div>
    );
  }

  const isLive = config.activeSession?.status === "live";
  const sessionEndsAt = config.activeSession?.endsAt
    ? new Date(config.activeSession.endsAt)
    : null;
  const remainingMs = sessionEndsAt ? sessionEndsAt.getTime() - Date.now() : 0;
  const remainingMins = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
  const remainingHours = Math.floor(remainingMins / 60);
  const remainingMinsRemainder = remainingMins % 60;

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
            onClick={loadData}
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
            Force Trigger Event
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
              <p className="text-sm font-mono text-muted-foreground">
                Host: <span className="text-foreground">{config.activeSession.host}:{config.activeSession.port}</span> • Room: {config.activeSession.roomId}
              </p>
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
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-mono"
              />
            </div>

            <div>
              <label className="font-medium text-foreground">Custom Announcement Title</label>
              <input
                type="text"
                placeholder="⚡ Pop-Up Game Night: {game}"
                value={config.discord?.customTitle || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    discord: { ...config.discord, customTitle: e.target.value },
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="font-medium text-foreground">Custom Announcement Message</label>
              <textarea
                rows={2}
                placeholder="A dedicated community match is live! Click 1-Click Launch below to play."
                value={config.discord?.customMessage || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    discord: { ...config.discord, customMessage: e.target.value },
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Game Pool & Edition Rotation Manager */}
      <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Layers className="size-5 text-primary" />
              <h3 className="font-semibold tracking-tight text-foreground">
                Eligible Rotation Pool & Editions
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Select which games and curated editions the Automated Event Planner can randomly pick or force trigger.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {candidateGames.map((game) => {
            const hasEditions = Boolean(game.editions && game.editions.length > 0);
            const basePoolItem = config.games.find((g) => g.slug === game.slug && !g.editionSlug);
            const isBaseEnabled = basePoolItem ? basePoolItem.enabled : false;

            return (
              <div
                key={game.slug}
                className="flex flex-col justify-between rounded-xl border border-border/70 bg-card/40 p-4 transition-all hover:border-border"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {game.coverImage ? (
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
                          <Image
                            src={game.coverImage}
                            alt={game.title}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted">
                          <Gamepad2 className="size-6 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-semibold text-sm leading-tight text-foreground">
                          {game.title}
                        </h4>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {game.slug}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleTrigger(game.slug)}
                      disabled={actionLoading !== null || !hostConfigured}
                      title="Trigger dedicated event for this game right now"
                      className="rounded-lg border border-border bg-secondary/40 p-1.5 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                    >
                      {actionLoading === `trigger-${game.slug}` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5 fill-current" />
                      )}
                    </button>
                  </div>

                  {/* Base Game Pool Toggle */}
                  <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3 text-xs">
                    <span className="text-muted-foreground">Include in Auto-Rotation</span>
                    <input
                      type="checkbox"
                      checked={isBaseEnabled}
                      onChange={() => toggleGameEnabled(game.slug)}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </div>

                  {/* Editions Sub-List if present */}
                  {hasEditions && (
                    <div className="mt-3 space-y-2 rounded-lg bg-secondary/30 p-2.5 text-xs">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <Flame className="size-3 text-amber-400" />
                        <span>Curated Editions</span>
                      </div>
                      {game.editions!.map((ed) => {
                        const edPoolItem = config.games.find(
                          (g) => g.slug === game.slug && g.editionSlug === ed.slug
                        );
                        const isEdEnabled = edPoolItem ? edPoolItem.enabled : false;

                        return (
                          <div
                            key={ed.slug}
                            className="flex items-center justify-between gap-2 border-t border-border/30 pt-1.5"
                          >
                            <div className="truncate">
                              <span className="font-medium text-foreground">{ed.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleTrigger(game.slug, ed.slug)}
                                disabled={actionLoading !== null || !hostConfigured}
                                title={`Trigger dedicated match for ${ed.name}`}
                                className="rounded p-1 text-muted-foreground hover:text-foreground"
                              >
                                {actionLoading === `trigger-${game.slug}:${ed.slug}` ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Play className="size-3 fill-current" />
                                )}
                              </button>
                              <input
                                type="checkbox"
                                checked={isEdEnabled}
                                onChange={() =>
                                  toggleGameEnabled(game.slug, ed.slug, ed.name)
                                }
                                className="size-3.5 rounded border-border text-primary focus:ring-primary"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Match History Log */}
      <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-6">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-2.5">
            <Activity className="size-5 text-primary" />
            <h3 className="font-semibold tracking-tight text-foreground">Recent Event History</h3>
          </div>
          <span className="text-xs text-muted-foreground">{logs.length} logged sessions</span>
        </div>

        {logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No automated events have been triggered yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="pb-2 font-medium">Event / Game</th>
                  <th className="pb-2 font-medium">Server IP:Port</th>
                  <th className="pb-2 font-medium">Triggered At</th>
                  <th className="pb-2 font-medium">Duration</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {logs.map((log) => (
                  <tr key={log._id} className="text-muted-foreground">
                    <td className="py-2.5 font-medium text-foreground">
                      {log.gameTitle || log.gameSlug}
                    </td>
                    <td className="py-2.5 font-mono">
                      {log.host ? `${log.host}:${log.port}` : "—"}
                    </td>
                    <td className="py-2.5">{new Date(log.startedAt).toLocaleString()}</td>
                    <td className="py-2.5">
                      {log.durationMinutes ? `${log.durationMinutes} mins` : "—"}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          log.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : log.status === "force_stopped"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {log.status === "completed"
                          ? "Completed"
                          : log.status === "force_stopped"
                            ? "Manual Stop"
                            : "Failed"}
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

// Backwards compatibility alias
export const AutonomousMatchmakerManager = AutomatedEventPlannerManager;
