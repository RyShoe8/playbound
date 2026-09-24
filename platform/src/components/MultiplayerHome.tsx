"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Swords,
  Users,
  Server,
  Radio,
  Plus,
  Search,
  Sparkles,
  CalendarDays,
  X,
  Check,
  Filter,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { usePartyStore } from "@/stores/partyStore";
import { CreatePartyPanel } from "@/components/friends/CreatePartyPanel";
import { MultiplayerGameCard } from "@/components/MultiplayerGameCard";
import { MultiplayerFriendsSection } from "@/components/MultiplayerFriendsSection";
import { MultiplayerOpenParties } from "@/components/MultiplayerOpenParties";
import { MultiplayerEvents, type PlatformEvent } from "@/components/MultiplayerEvents";
import { GlobalServerBrowser } from "@/components/GlobalServerBrowser";
import type { PublicPartyPayload } from "@/lib/playTogether/party";
import type {
  GameMultiplayerActivity,
  MultiplayerActivityResponse,
} from "@/lib/multiplayer/activity";
import { cn } from "@/lib/utils";

type Props = {
  installedGameSlugs: string[];
  installedModSlugs: string[];
  signedIn: boolean;
  allowedSlugs?: string[] | null;
  initialActivity?: MultiplayerActivityResponse | null;
  initialParties?: PublicPartyPayload[];
  initialEvents?: PlatformEvent[];
};

export function MultiplayerHome({
  installedGameSlugs,
  installedModSlugs,
  signedIn,
  allowedSlugs,
  initialActivity,
  initialParties,
  initialEvents,
}: Props) {
  const { activeParty } = usePartyStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTab = searchParams.get("tab");

  // Activity aggregation state — pre-hydrated instantly from server cache
  const [activityData, setActivityData] = useState<MultiplayerActivityResponse | null>(
    initialActivity || null
  );
  const [activityLoading, setActivityLoading] = useState(!initialActivity);

  // Active section tab
  const [activeTab, setActiveTab] = useState<"overview" | "games" | "parties" | "servers" | "events">(
    queryTab === "games" || queryTab === "parties" || queryTab === "servers" || queryTab === "events"
      ? queryTab
      : searchParams.get("game")
      ? "servers"
      : "overview"
  );

  const [previousQueryTab, setPreviousQueryTab] = useState(queryTab);
  if (queryTab !== previousQueryTab) {
    setPreviousQueryTab(queryTab);
    if (
      queryTab &&
      (queryTab === "overview" ||
        queryTab === "games" ||
        queryTab === "parties" ||
        queryTab === "servers" ||
        queryTab === "events")
    ) {
      setActiveTab(queryTab);
    }
  }

  // Create party drawer
  const [createPartyOpen, setCreatePartyOpen] = useState(false);
  const [selectedGameForParty, setSelectedGameForParty] = useState<string | undefined>(undefined);

  // Looking to party state
  const [ltpDrawerOpen, setLtpDrawerOpen] = useState(false);
  const [ltpActive, setLtpActive] = useState(false);
  const [ltpSelectedSlugs, setLtpSelectedSlugs] = useState<string[]>([]);
  const [ltpBusy, setLtpBusy] = useState(false);
  const [ltpSearchQuery, setLtpSearchQuery] = useState("");
  const [installedOnly, setInstalledOnly] = useState(false);
  const installedSet = useMemo(() => new Set(installedGameSlugs || []), [installedGameSlugs]);

  // Game filter state
  const [gameSearch, setGameSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "parties" | "looking" | "servers">("all");

  const serverBrowserRef = useRef<HTMLDivElement>(null);

  // Load activity aggregation
  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/multiplayer/activity");
      if (!res.ok) return;
      const data: MultiplayerActivityResponse = await res.json();
      setActivityData(data);
    } catch (err) {
      console.error("Failed to load multiplayer activity:", err);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    let initialTimer: ReturnType<typeof setTimeout> | undefined;
    if (!initialActivity) {
      initialTimer = setTimeout(() => void loadActivity(), 0);
    }
    const interval = setInterval(loadActivity, 30_000);
    return () => {
      if (initialTimer) clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [loadActivity, initialActivity]);

  // Check viewer's own Looking to Party state
  useEffect(() => {
    if (!signedIn) return;
    async function checkMyLtp() {
      try {
        const res = await fetch("/api/play-together");
        if (!res.ok) return;
        const data = await res.json();
        const myLfg = data.myLfg;
        setLtpActive(Boolean(myLfg?.active));
        setLtpSelectedSlugs(
          Array.isArray(myLfg?.gameSlugs)
            ? myLfg.gameSlugs
            : myLfg?.gameSlug
            ? [myLfg.gameSlug]
            : []
        );
      } catch (err) {
        console.error("Failed to check Looking to Party status:", err);
      }
    }
    checkMyLtp();
  }, [signedIn]);

  // Toggle or update Looking to Party
  async function handleToggleLtp(slugs: string[]) {
    if (!signedIn) {
      window.location.href = "/login?callbackUrl=/multiplayer";
      return;
    }
    setLtpBusy(true);
    try {
      if (slugs.length === 0 && ltpActive) {
        const res = await fetch("/api/presence/lfg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
        if (res.ok) {
          setLtpActive(false);
          setLtpSelectedSlugs([]);
          setLtpDrawerOpen(false);
        }
      } else {
        const res = await fetch("/api/presence/lfg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true, gameSlugs: slugs }),
        });
        if (res.ok) {
          setLtpActive(true);
          setLtpSelectedSlugs(slugs);
          setLtpDrawerOpen(false);
        }
      }
      void loadActivity();
    } catch (err) {
      console.error("Failed to update Looking to Party:", err);
    } finally {
      setLtpBusy(false);
    }
  }

  // Filtered games
  const gamesList = activityData?.games || [];
  const filteredGames = useMemo(() => {
    return gamesList.filter((game) => {
      // Access allowed slugs filter
      if (allowedSlugs && allowedSlugs.length > 0 && !allowedSlugs.includes(game.gameSlug)) {
        return false;
      }

      // Global installed filter
      if (installedOnly && !installedSet.has(game.gameSlug)) {
        return false;
      }

      // Search term
      if (gameSearch.trim()) {
        const q = gameSearch.toLowerCase();
        const matchesTitle = game.gameTitle.toLowerCase().includes(q);
        const matchesTags = game.tags?.some((t) => t.toLowerCase().includes(q));
        const matchesGenre = game.genre?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesTags && !matchesGenre) return false;
      }

      // Filter tabs
      if (filterType === "parties") return game.openPartyCount > 0;
      if (filterType === "looking") return game.usersLookingCount > 0;
      if (filterType === "servers") return game.serverPlayerCount > 0 || game.serversOnline > 0;

      return true;
    });
  }, [gamesList, allowedSlugs, installedOnly, installedSet, gameSearch, filterType]);

  // Spotlight active games for Overview
  const activeSpotlightGames = useMemo(() => {
    const active = filteredGames.filter(
      (g) => g.openPartyCount > 0 || g.usersLookingCount > 0 || g.serverPlayerCount > 0 || g.serversOnline > 0
    );
    return (active.length > 0 ? active : filteredGames).slice(0, 6);
  }, [filteredGames]);

  // Available games for LTP picker, sorting installed games first
  const ltpAvailableGames = useMemo(() => {
    const q = ltpSearchQuery.trim().toLowerCase();
    const filtered = gamesList.filter((g) => {
      if (!q) return true;
      return (
        g.gameTitle.toLowerCase().includes(q) ||
        g.genre?.toLowerCase().includes(q) ||
        g.tags?.some((t) => t.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      const aInstalled = installedSet.has(a.gameSlug) ? 1 : 0;
      const bInstalled = installedSet.has(b.gameSlug) ? 1 : 0;
      if (aInstalled !== bInstalled) {
        return bInstalled - aInstalled; // Installed games first!
      }
      return a.gameTitle.localeCompare(b.gameTitle);
    });
  }, [gamesList, ltpSearchQuery, installedSet]);

  // Handle tab switching with URL sync
  function handleTabChange(tab: "overview" | "games" | "parties" | "servers" | "events") {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    const next = qs ? `/multiplayer?${qs}` : "/multiplayer";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      router.replace(next, { scroll: false });
    }
  }

  // Jump to server browser for a specific game
  function handleBrowseServers(slug: string) {
    handleTabChange("servers");
    setTimeout(() => {
      serverBrowserRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  // Start a party for a specific game
  function handleStartPartyForGame(slug: string) {
    setSelectedGameForParty(slug);
    setCreatePartyOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Select a game for Looking to Party
  function handleSelectForLtp(slug: string) {
    if (!ltpSelectedSlugs.includes(slug)) {
      setLtpSelectedSlugs((prev) => [...prev, slug]);
    }
    setLtpDrawerOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const summary = activityData?.summary || {
    totalServerPlayers: 0,
    totalServersOnline: 0,
    totalOpenParties: 0,
    totalUsersLooking: 0,
  };

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card/90 to-primary/5 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Swords className="size-3.5" />
              <span>Multiplayer Hub</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              Multiplayer
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Join open parties, jump into live community game servers, or raise your hand with Looking to Party to get matched.
            </p>
          </div>

          {/* Quick CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!signedIn) {
                  window.location.href = "/login?callbackUrl=/multiplayer";
                  return;
                }
                setCreatePartyOpen((v) => !v);
                setLtpDrawerOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="size-4" />
              {createPartyOpen ? "Close Party Panel" : "Start Party"}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!signedIn) {
                  window.location.href = "/login?callbackUrl=/multiplayer";
                  return;
                }
                setLtpDrawerOpen((v) => !v);
                setCreatePartyOpen(false);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-extrabold shadow-sm active:scale-95 transition-all",
                ltpActive
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                  : "border-border bg-secondary hover:bg-secondary/80 text-foreground"
              )}
            >
              <Radio className={cn("size-4", ltpActive && "animate-pulse text-amber-400")} />
              {ltpActive ? "Looking to Party (Active)" : "Looking to Party"}
            </button>
          </div>
        </div>

        {/* Real-time Summary Stat Bar */}
        <div className="relative z-10 mt-6 pt-6 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/40 bg-secondary/30 p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
              <Server className="size-3.5 text-cyan-400" />
              <span>Tracked Server Players</span>
            </div>
            <div className="mt-1 text-xl font-black text-foreground">
              {summary.totalServerPlayers.toLocaleString()}
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-secondary/30 p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
              <Users className="size-3.5 text-primary" />
              <span>Open Parties</span>
            </div>
            <div className="mt-1 text-xl font-black text-primary">
              {summary.totalOpenParties}
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-secondary/30 p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
              <Radio className="size-3.5 text-amber-400" />
              <span>Users Looking to Party</span>
            </div>
            <div className="mt-1 text-xl font-black text-amber-400">
              {summary.totalUsersLooking}
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-secondary/30 p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
              <Server className="size-3.5 text-muted-foreground" />
              <span>Servers Online</span>
            </div>
            <div className="mt-1 text-xl font-black text-muted-foreground">
              {summary.totalServersOnline.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Active Party Notice */}
      {activeParty && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-primary/50 bg-primary/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xs">
              PARTY
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                You are in an active party for {activeParty.gameTitle || activeParty.gameSlug || "Game"}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeParty.members?.length || 1} / {activeParty.maxSize} players • Status: {activeParty.status}
              </p>
            </div>
          </div>
          <Link
            href={`/friends?party=${activeParty.id}`}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-110 flex items-center gap-1.5"
          >
            Open Party View
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}

      {/* Expandable: Create Party Drawer */}
      {createPartyOpen && (
        <div className="rounded-2xl border border-primary/40 bg-card p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Start a PlayBound Party</h2>
              <p className="text-xs text-muted-foreground">
                Parties coordinate players, sync game editions & mods, and launch directly together into servers or host sessions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatePartyOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <CreatePartyPanel
            gameSlug={selectedGameForParty}
            onCreated={() => {
              setCreatePartyOpen(false);
              void loadActivity();
            }}
          />
        </div>
      )}

      {/* Expandable: Looking to Party Drawer */}
      {ltpDrawerOpen && (
        <div className="rounded-2xl border border-amber-500/40 bg-card p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-200 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-300 border border-amber-500/30">
                <Radio className="size-3" />
                Looking to Party Matchmaking
              </div>
              <h2 className="text-lg font-bold text-foreground mt-1">
                What games do you want to play right now?
              </h2>
              <p className="text-xs text-muted-foreground">
                Select games you want to play. PlayBound will match you with other players searching for overlapping games or direct you into open parties.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLtpDrawerOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Selected Games Chips */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">
              Selected ({ltpSelectedSlugs.length}):
            </div>
            <div className="flex flex-wrap gap-2">
              {ltpSelectedSlugs.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">
                  No specific games selected (you will match for anything)
                </span>
              ) : (
                ltpSelectedSlugs.map((slug) => {
                  const game = gamesList.find((g) => g.gameSlug === slug);
                  return (
                    <span
                      key={slug}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-300"
                    >
                      {game?.gameTitle || slug}
                      <button
                        type="button"
                        onClick={() =>
                          setLtpSelectedSlugs((prev) => prev.filter((s) => s !== slug))
                        }
                        className="rounded-full hover:bg-amber-500/40 p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* Game Selection Search */}
          <div className="space-y-2">
            <input
              type="search"
              placeholder="Search multiplayer games to add…"
              value={ltpSearchQuery}
              onChange={(e) => setLtpSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary/50 px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
            />
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
              {ltpAvailableGames
                .slice(0, 32)
                .map((g) => {
                  const isSelected = ltpSelectedSlugs.includes(g.gameSlug);
                  const isInstalled = installedSet.has(g.gameSlug);
                  return (
                    <button
                      key={g.gameSlug}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setLtpSelectedSlugs((prev) =>
                            prev.filter((s) => s !== g.gameSlug)
                          );
                        } else {
                          setLtpSelectedSlugs((prev) => [...prev, g.gameSlug]);
                        }
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                        isSelected
                          ? "bg-amber-500 text-black font-bold"
                          : isInstalled
                          ? "border border-emerald-500/40 bg-emerald-500/10 text-foreground hover:bg-emerald-500/20"
                          : "border border-border bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-40"
                      )}
                      title={isInstalled ? `Installed · ${g.gameTitle}` : g.gameTitle}
                    >
                      {isInstalled && !isSelected && (
                        <span className="size-1.5 rounded-full bg-emerald-400 inline-block" title="Installed" />
                      )}
                      <span>{g.gameTitle}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground">
              Search expires automatically after 60 minutes.
            </span>
            <div className="flex items-center gap-2">
              {ltpActive && (
                <button
                  type="button"
                  disabled={ltpBusy}
                  onClick={() => handleToggleLtp([])}
                  className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                >
                  Stop Looking
                </button>
              )}
              <button
                type="button"
                disabled={ltpBusy}
                onClick={() => handleToggleLtp(ltpSelectedSlugs)}
                className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-extrabold text-black hover:brightness-110 disabled:opacity-50"
              >
                {ltpBusy
                  ? "Saving…"
                  : ltpActive
                  ? "Update Looking Status"
                  : "Start Looking to Party"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            className={cn(
              "rounded-xl px-4 py-2 text-xs font-bold transition-all",
              activeTab === "overview"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            All Activity
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("games")}
            className={cn(
              "rounded-xl px-4 py-2 text-xs font-bold transition-all",
              activeTab === "games"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            Games ({filteredGames.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("servers")}
            className={cn(
              "rounded-xl px-4 py-2 text-xs font-bold transition-all",
              activeTab === "servers"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            Live Server Browser
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("events")}
            className={cn(
              "rounded-xl px-4 py-2 text-xs font-bold transition-all",
              activeTab === "events"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            Events
          </button>

          {/* Global Filter: Installed Only (placed to the right of events) */}
          <div className="h-5 w-px bg-border/60 mx-1.5" />
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors">
            <input
              type="checkbox"
              checked={installedOnly}
              onChange={(e) => setInstalledOnly(e.target.checked)}
              className="size-3.5 rounded border-border text-primary accent-primary focus:ring-primary/20 cursor-pointer"
            />
            <span>Installed only</span>
          </label>
        </div>

        {/* Search for Games */}
        {activeTab === "games" && (
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search games, tags…"
              value={gameSearch}
              onChange={(e) => setGameSearch(e.target.value)}
              className="h-9 w-full rounded-xl border border-border bg-secondary/50 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
      </div>

      {/* View: Overview (All Activity Feed) */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* Friends Active Section */}
          <MultiplayerFriendsSection
            signedIn={signedIn}
            onJoinLtpWithFriend={(friendSlugs) => {
              setLtpSelectedSlugs(friendSlugs);
              setLtpDrawerOpen(true);
            }}
          />

          {/* Open Parties Section */}
          <MultiplayerOpenParties
            signedIn={signedIn}
            initialParties={initialParties}
            installedGameSlugs={installedGameSlugs}
            installedOnly={installedOnly}
            onStartParty={() => {
              setCreatePartyOpen(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />

          {/* Spotlight Shelf: Active Right Now */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
                  <Swords className="size-4 text-primary" />
                  Active Right Now
                </h2>
                <p className="text-xs text-muted-foreground">
                  Multiplayer games with live parties, players looking to play, or active servers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTabChange("games")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/60 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-secondary transition-colors"
              >
                Browse all {filteredGames.length} games
                <ArrowRight className="size-3.5" />
              </button>
            </div>

            {activityLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-44 rounded-2xl border border-border/50 bg-secondary/20 animate-pulse" />
                ))}
              </div>
            ) : activeSpotlightGames.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/10 p-8 text-center">
                <p className="text-sm font-semibold text-muted-foreground">
                  {installedOnly
                    ? "No installed multiplayer games found with active players. Try turning off 'Installed only'."
                    : "No active multiplayer games right now. Start a party or check the server browser below!"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeSpotlightGames.map((game) => (
                  <MultiplayerGameCard
                    key={game.gameSlug}
                    activity={game}
                    onSelectGameForLtp={handleSelectForLtp}
                    onBrowseServers={handleBrowseServers}
                    onStartParty={handleStartPartyForGame}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Live Servers Ecosystem */}
          <div ref={serverBrowserRef} className="space-y-4 pt-4 border-t border-border/50">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-cyan-300 border border-cyan-500/30">
                <Server className="size-3" />
                Live Server Ecosystem
              </div>
              <h2 className="text-lg font-extrabold tracking-tight mt-1 text-foreground">
                Live Community & Dedicated Servers
              </h2>
              <p className="text-xs text-muted-foreground">
                Real-time query data from official master lists and community game servers.
              </p>
            </div>

            <GlobalServerBrowser
              installedGameSlugs={installedGameSlugs}
              installedModSlugs={installedModSlugs}
              signedIn={signedIn}
              allowedSlugs={allowedSlugs}
              hideInstalledToggle={true}
              installedOnly={installedOnly}
            />
          </div>

          {/* Events */}
          <div className="pt-4 border-t border-border/50">
            <MultiplayerEvents initialEvents={initialEvents} />
          </div>
        </div>
      )}

      {/* View: Games Directory */}
      {activeTab === "games" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
                <Swords className="size-4 text-primary" />
                Multiplayer Games Directory ({filteredGames.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Explore all multiplayer-supported titles, community servers, and matchmaking.
              </p>
            </div>

            {/* Sub-filters */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold",
                  filterType === "all" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterType("parties")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold",
                  filterType === "parties" ? "bg-secondary text-primary font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                With Parties
              </button>
              <button
                type="button"
                onClick={() => setFilterType("looking")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold",
                  filterType === "looking" ? "bg-secondary text-amber-400 font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Looking for Players
              </button>
              <button
                type="button"
                onClick={() => setFilterType("servers")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold",
                  filterType === "servers" ? "bg-secondary text-cyan-400 font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Live Servers
              </button>
            </div>
          </div>

          {activityLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-44 rounded-2xl border border-border/50 bg-secondary/20 animate-pulse" />
              ))}
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/10 p-8 text-center">
              <p className="text-sm font-semibold text-muted-foreground">
                {installedOnly
                  ? "No installed multiplayer games match your current filter. Try turning off 'Installed only'."
                  : "No multiplayer games match your current filter."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGames.map((game) => (
                <MultiplayerGameCard
                  key={game.gameSlug}
                  activity={game}
                  onSelectGameForLtp={handleSelectForLtp}
                  onBrowseServers={handleBrowseServers}
                  onStartParty={handleStartPartyForGame}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* View: Live Servers Browser */}
      {activeTab === "servers" && (
        <div ref={serverBrowserRef} className="space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-cyan-300 border border-cyan-500/30">
              <Server className="size-3" />
              Live Server Ecosystem
            </div>
            <h2 className="text-lg font-extrabold tracking-tight mt-1 text-foreground">
              Live Community & Dedicated Servers
            </h2>
            <p className="text-xs text-muted-foreground">
              Real-time query data from official master lists and community game servers. Player counts represent total players on those servers, not concurrent PlayBound accounts.
            </p>
          </div>

          <GlobalServerBrowser
            installedGameSlugs={installedGameSlugs}
            installedModSlugs={installedModSlugs}
            signedIn={signedIn}
            allowedSlugs={allowedSlugs}
            hideInstalledToggle={true}
            installedOnly={installedOnly}
          />
        </div>
      )}

      {/* View: Events */}
      {activeTab === "events" && (
        <div className="space-y-4">
          <MultiplayerEvents initialEvents={initialEvents} />
        </div>
      )}
    </div>
  );
}
