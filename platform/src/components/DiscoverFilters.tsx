"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import type { Game, Genre } from "@/lib/data/types";
import type { HardwareRequirementsBlock } from "@/lib/hardware/types";
import { evaluateCompatibility } from "@/lib/hardware/compatibility";
import { useTelemetry } from "@/lib/telemetry";
import { GameCard } from "@/components/GameCard";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { filterGamesForPreference } from "@/lib/compatibility/compatibility";
import {
  CompatibleGamesFade,
} from "@/components/compatibility/useFilteredGames";

/* ── Types ─────────────────────────────────────────────────── */

type SortOption = "name" | "size";
type HwFilter = "" | "great" | "playable";

interface SerializedGame {
  slug: string;
  title: string;
  tagline: string;
  genres: Genre[];
  tags: string[];
  features: string[];
  sizeMB: number;
  launchMethods: string[];
  art: { from: string; to: string; icon: string };
  coverImage?: string;
  browserPlayable: boolean;
  steamDeck: boolean;
  platforms: string[];
  hardwareRequirements?: HardwareRequirementsBlock | null;
}

/* ── Main component ─────────────────────────────────────────── */

export function DiscoverFilters({
  games,
  playingNowBySlug = {},
}: {
  games: Game[];
  playingNowBySlug?: Record<string, number>;
}) {
  const { track } = useTelemetry();
  const { mode, device } = useCompatibilityFilter();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState<SortOption>("name");
  const [multiplayerOnly, setMultiplayerOnly] = useState(false);
  const [installableOnly, setInstallableOnly] = useState(false);
  const [hwFilter, setHwFilter] = useState<HwFilter>("");
  const [userHw, setUserHw] = useState<{
    cpuTier?: string;
    gpuTier?: string;
    ramMB?: number | null;
    osFamily?: string;
    arch?: string;
    cpuDisplay?: string | null;
    gpuDisplay?: string | null;
  } | null>(null);
  const skipFirstFilter = useRef(true);

  useEffect(() => {
    void fetch("/api/hardware/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const p = data?.profile;
        if (!p) return;
        const idx = p.primaryGpuIndex ?? 0;
        const gpu = p.gpus?.[idx] || p.gpus?.[0];
        setUserHw({
          cpuTier: p.cpu?.tier,
          gpuTier: gpu?.tier || "unknown",
          ramMB: p.memory?.totalMB,
          osFamily: p.os?.family,
          arch: p.os?.arch,
          cpuDisplay: p.cpu?.displayName,
          gpuDisplay: gpu?.displayName,
        });
      })
      .catch(() => {});
  }, []);

  /* Derive available genres from games list */
  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      for (const gen of g.genres) set.add(gen);
    }
    return [...set].sort();
  }, [games]);

  const gamesBySlug = useMemo(() => new Map(games.map((g) => [g.slug, g])), [games]);

  /* Serialize Game → SerializedGame once (strip unneeded fields) */
  const serialized = useMemo<SerializedGame[]>(
    () =>
      games.map((g) => ({
        slug: g.slug,
        title: g.title,
        tagline: g.tagline,
        genres: g.genres,
        tags: g.tags,
        features: g.features,
        sizeMB: g.sizeMB,
        launchMethods: g.launchMethods,
        art: g.art,
        coverImage: g.coverImage,
        browserPlayable: g.browserPlayable,
        steamDeck: g.steamDeck,
        platforms: g.platforms,
        hardwareRequirements: g.hardwareRequirements,
      })),
    [games]
  );

  /* Filter + sort */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = serialized.slice();

    if (q) {
      list = list.filter((g) => {
        const blob = [
          g.title,
          g.tagline,
          ...g.tags,
          ...g.genres,
          g.slug,
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }

    if (genre) {
      list = list.filter((g) => g.genres.includes(genre as Genre));
    }

    if (multiplayerOnly) {
      list = list.filter(
        (g) =>
          g.features.some((f) => f.toLowerCase().includes("multiplayer")) ||
          g.tags.some((t) => t.toLowerCase().includes("multiplayer"))
      );
    }

    if (installableOnly) {
      list = list.filter((g) => g.launchMethods.includes("install"));
    }

    if (hwFilter && userHw) {
      list = list.filter((g) => {
        const r = evaluateCompatibility(
          {
            cpuTier: userHw.cpuTier as never,
            gpuTier: userHw.gpuTier as never,
            ramMB: userHw.ramMB ?? null,
            osFamily: userHw.osFamily,
            arch: userHw.arch,
            cpuDisplay: userHw.cpuDisplay,
            gpuDisplay: userHw.gpuDisplay,
          },
          g.hardwareRequirements
        );
        if (hwFilter === "great") return r.verdict === "excellent" || r.verdict === "good";
        return r.verdict === "excellent" || r.verdict === "good" || r.verdict === "playable";
      });
    }

    list = filterGamesForPreference(list, mode, device.type);

    if (sort === "size") {
      list.sort((a, b) => b.sizeMB - a.sizeMB);
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return list;
  }, [
    serialized,
    query,
    genre,
    sort,
    multiplayerOnly,
    installableOnly,
    hwFilter,
    userHw,
    mode,
    device.type,
  ]);

  useEffect(() => {
    if (skipFirstFilter.current) {
      skipFirstFilter.current = false;
      return;
    }
    const handle = window.setTimeout(() => {
      const q = query.trim();
      if (q) {
        void track("search", { query: q, resultsCount: filtered.length });
      }
      void track("filter_changed", {
        surface: "discover",
        filters: {
          genre,
          sort,
          multiplayerOnly,
          installableOnly,
          hwFilter: hwFilter || undefined,
          query: q || undefined,
          compatibility: mode,
        },
      });
      if (hwFilter) {
        void track("runs_great_filter_used", { filter: hwFilter });
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [
    query,
    genre,
    sort,
    multiplayerOnly,
    installableOnly,
    hwFilter,
    filtered.length,
    track,
    mode,
  ]);

  const animKey = `${mode}|${hwFilter}|${filtered.map((g) => g.slug).join(",")}`;

  return (
    <>
      {/* ── Filter toolbar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search */}
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search title, tagline, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-secondary/50 pl-9 pr-3 text-sm font-medium outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring"
          />
        </div>

        {/* Genre dropdown */}
        <PremiumSelect
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm font-semibold outline-none transition-colors focus:border-ring"
        >
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </PremiumSelect>

        {/* Sort dropdown */}
        <PremiumSelect
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm font-semibold outline-none transition-colors focus:border-ring"
        >
          <option value="name">Sort: Name</option>
          <option value="size">Sort: Size</option>
        </PremiumSelect>

        {/* Hardware performance + checkboxes (compact cluster) */}
        <div className="inline-flex shrink-0 flex-wrap items-center gap-2.5">
          <PremiumSelect
            value={hwFilter}
            onChange={(e) => {
              const v = e.target.value as HwFilter;
              if (!userHw && v) {
                // Soft prompt — stay on discover; users open launcher via sync/cta elsewhere.
                setHwFilter("");
                window.alert(
                  "Open PlayBound while signed in to sync your PC, then use this filter."
                );
                return;
              }
              setHwFilter(v);
            }}
            className="!w-auto h-9 max-w-[15rem] rounded-lg border border-input bg-secondary/50 px-3 text-sm font-semibold outline-none transition-colors focus:border-ring"
            title={
              userHw
                ? "Filter by performance on your synced PC"
                : "Filter by performance on your synced PC (open the launcher while signed in)"
            }
          >
            <option value="">How well on my PC: any</option>
            <option value="great">{userHw ? "Great" : "Great (needs launcher)"}</option>
            <option value="playable">
              {userHw ? "Playable or better" : "Playable or better (needs launcher)"}
            </option>
          </PremiumSelect>
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground whitespace-nowrap select-none">
            <input
              type="checkbox"
              checked={multiplayerOnly}
              onChange={(e) => setMultiplayerOnly(e.target.checked)}
              className="accent-primary"
            />
            Multiplayer
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground whitespace-nowrap select-none">
            <input
              type="checkbox"
              checked={installableOnly}
              onChange={(e) => setInstallableOnly(e.target.checked)}
              className="accent-primary"
            />
            Installable
          </label>
        </div>
      </div>

      {/* ── Count ────────────────────────────────────────────── */}
      <p className="mt-2.5 text-sm font-medium text-muted-foreground">
        {filtered.length} game{filtered.length === 1 ? "" : "s"}
      </p>

      {/* ── Grid ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No games match your filters.
        </p>
      ) : (
        <CompatibleGamesFade animKey={animKey}>
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-5">
            {filtered.map((g, i) => {
              const full = gamesBySlug.get(g.slug);
              if (!full) return null;
              return (
                <div
                  key={g.slug}
                  className="opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <GameCard
                    game={full}
                    className="w-full sm:w-full"
                    playingNow={playingNowBySlug[g.slug] ?? 0}
                  />
                </div>
              );
            })}
          </div>
        </CompatibleGamesFade>
      )}
    </>
  );
}
