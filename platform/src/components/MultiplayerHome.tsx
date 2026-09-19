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

const MAX_LFG_GAMES = 6;

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

  useEffect(() => {
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
  }, [queryTab]);

  // Create party drawer
  const [createPartyOpen, setCreatePartyOpen] = useState(false);
  const [selectedGameForParty, setSelectedGameForParty] = useState<string | undefined>(undefined);

  // Looking to party state
  const [ltpDrawerOpen, setLtpDrawerOpen] = useState(false);
  const [ltpActive, setLtpActive] = useState(false);
  const [ltpSelectedSlugs, setLtpSelectedSlugs] = useState<string[]>([]);
  const [ltpBusy, setLtpBusy] = useState(false);
  const [ltpSearchQuery, setLtpSearchQuery] = useState("");

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
    if (!initialActivity) {
      loadActivity();
    }
    const interval = setInterval(loadActivity, 30_000);
    return () => clearInterval(interval);
  }, [loadActivity, initialActivity]);

  // Check viewer's own Looking to Party state
  useEffect(() => {
    if (!signedIn) return;
    async function checkMyLtp() {
      try {
        const res = await fetch("/api/presence/heartbeat");
        if (!res.ok) return;
        const data = await res.json();
        if (data.presence?.lookingForPlayersUntil) {
          const expiresAt = new Date(data.presence.lookingForPlayersUntil).getTime();
          if (expiresAt > Date.now()) {
            setLtpActive(true);
            const slugs = data.presence.lookingForPlayersGameIds || (data.presence.lookingForPlayersGameId ? [data.presence.lookingForPlayersGameId] : []);
            setLtpSelectedSlugs(slugs);
          } else {
            setLtpActive(false);
          }
        } else {
          setLtpActive(false);
        }
      } catch {
        /* ignore */
      }
    }
    checkMyLtp();
  }, [signedIn]);

  // Handle Starting / Stopping Looking to Party
  async function handleToggleLtp(slugs?: string[]) {
    if (!signedIn) {
      window.location.href = "/login?callbackUrl=/multiplayer";
      return;
    }

    setLtpBusy(true);
    try {
      const targetSlugs = slugs !== undefined ? slugs : ltpSelectedSlugs;
      const willEnable = targetSlugs.length > 0 || !ltpActive;

      const res = await fetch("/api/presence/lfg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: willEnable,
          gameSlugs: willEnable ? targetSlugs : [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLtpActive(data.active);
        setLtpSelectedSlugs(data.gameSlugs || []);
        if (!data.active) {
          setLtpDrawerOpen(false);
        }
        void loadActivity();
      }
    } catch (err) {
      console.error("Failed to toggle looking to party:", err);
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
  }, [gamesList, allowedSlugs, gameSearch, filterType]);

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
      setLtpSelectedSlugs((prev) => [...prev.slice(0, MAX_LFG_GAMES - 1), slug]);
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
                Select up to {MAX_LFG_GAMES} games. PlayBound will match you with other players searching for overlapping games or direct you into open parties.
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
              Selected ({ltpSelectedSlugs.length} / {MAX_LFG_GAMES}):
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
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
              {gamesList
                .filter((g) =>
                  ltpSearchQuery.trim()
                    ? g.gameTitle.toLowerCase().includes(ltpSearchQuery.toLowerCase())
                    : true
                )
                .slice(0, 16)
                .map((g) => {
                  const isSelected = ltpSelectedSlugs.includes(g.gameSlug);
                  return (
                    <button
                      key={g.gameSlug}
                      type="button"
                      disabled={!isSelected && ltpSelectedSlugs.length >= MAX_LFG_GAMES}
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
                        "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                        isSelected
                          ? "bg-amber-500 text-black font-bold"
                          : "border border-border bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-40"
                      )}
                    >
                      {g.gameTitle}
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
        onStartParty={() => {
          setCreatePartyOpen(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

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
        </div>

        {/* Search for Games */}
        {(activeTab === "overview" || activeTab === "games") && (
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

      {/* View: Overview & Games Grid */}
      {(activeTab === "overview" || activeTab === "games") && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
                <Swords className="size-4 text-primary" />
                Active Multiplayer Games ({filteredGames.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Ranked by real player activity across PlayBound parties, looking-to-party users, and tracked servers.
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
                No multiplayer games match your current filter.
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
      {(activeTab === "overview" || activeTab === "servers") && (
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
              Real-time query data from official master lists and community game servers. Player counts represent total players on those servers, not concurrent PlayBound accounts.
            </p>
          </div>

          <GlobalServerBrowser
            installedGameSlugs={installedGameSlugs}
            installedModSlugs={installedModSlugs}
            signedIn={signedIn}
            allowedSlugs={allowedSlugs}
          />
        </div>
      )}

      {/* View: Events */}
      {(activeTab === "overview" || activeTab === "events") && (
        <div className="pt-4 border-t border-border/50">
          <MultiplayerEvents initialEvents={initialEvents} />
        </div>
      )}
    </div>
  );
}
