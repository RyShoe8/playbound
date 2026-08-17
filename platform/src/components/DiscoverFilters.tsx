"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { PremiumSelect } from "@/components/ui/PremiumSelect";
import { Checkbox } from "@/components/ui/Checkbox";
import type { Game, Genre } from "@/lib/data/types";
import type { HardwareRequirementsBlock } from "@/lib/hardware/types";
import { evaluateCompatibility } from "@/lib/hardware/compatibility";
import { useTelemetry } from "@/lib/telemetry";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { filterGamesForPreference } from "@/lib/compatibility/compatibility";
import { CompatibleGamesFade } from "@/components/compatibility/useFilteredGames";
import { GenreGameRow } from "@/components/GenreGameRow";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────── */

type SortOption = "name" | "size" | "players";
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
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [sort, setSort] = useState<SortOption>("name");
  const [multiplayerOnly, setMultiplayerOnly] = useState(false);
  /** Only games with someone in them right now, per the shared live snapshot. */
  const [hasPlayersOnly, setHasPlayersOnly] = useState(false);
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

  /* Filter games based on current filter states (before genre split) */
  const baseFiltered = useMemo(() => {
    let list = serialized.slice();

    if (multiplayerOnly) {
      list = list.filter(
        (g) =>
          g.features.some((f) => f.toLowerCase().includes("multiplayer")) ||
          g.tags.some((t) => t.toLowerCase().includes("multiplayer"))
      );
    }

    /*
     * Reads the same 15-minute snapshot the cards show their counts from, so
     * the filter and the "N playing" on each card can never disagree. A slug
     * absent from the snapshot has nobody in it.
     */
    if (hasPlayersOnly) {
      list = list.filter((g) => (playingNowBySlug[g.slug] ?? 0) > 0);
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
    } else if (sort === "players") {
      list.sort(
        (a, b) => (playingNowBySlug[b.slug] ?? 0) - (playingNowBySlug[a.slug] ?? 0) || a.title.localeCompare(b.title)
      );
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return list;
  }, [
    serialized,
    multiplayerOnly,
    hasPlayersOnly,
    hwFilter,
    userHw,
    mode,
    device.type,
    sort,
    playingNowBySlug,
  ]);

  /* Derive available genres from games matching base filters */
  const allGenresWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of baseFiltered) {
      for (const gen of g.genres) {
        counts.set(gen, (counts.get(gen) ?? 0) + 1);
      }
    }
    // Sort genres alphabetically
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [baseFiltered]);

  /* Group games by genre */
  const genreSections = useMemo(() => {
    const genresToRender = selectedGenre
      ? allGenresWithCounts.filter((g) => g.name === selectedGenre)
      : allGenresWithCounts;

    return genresToRender
      .map(({ name }) => {
        const matchingGames = baseFiltered
          .filter((g) => g.genres.includes(name as Genre))
          .map((g) => gamesBySlug.get(g.slug)!)
          .filter(Boolean);

        return {
          genre: name,
          games: matchingGames,
        };
      })
      .filter((section) => section.games.length > 0);
  }, [selectedGenre, allGenresWithCounts, baseFiltered, gamesBySlug]);

  /* Count total unique games currently displayed */
  const totalDisplayCount = useMemo(() => {
    if (!selectedGenre) {
      return baseFiltered.length;
    }
    return baseFiltered.filter((g) => g.genres.includes(selectedGenre as Genre)).length;
  }, [baseFiltered, selectedGenre]);

  useEffect(() => {
    if (skipFirstFilter.current) {
      skipFirstFilter.current = false;
      return;
    }
    const handle = window.setTimeout(() => {
      void track("filter_changed", {
        surface: "discover",
        filters: {
          genre: selectedGenre || undefined,
          sort,
          multiplayerOnly,
          hwFilter: hwFilter || undefined,
          compatibility: mode,
        },
      });
      if (hwFilter) {
        void track("runs_great_filter_used", { filter: hwFilter });
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [
    selectedGenre,
    sort,
    multiplayerOnly,
    hwFilter,
    track,
    mode,
  ]);

  const animKey = `${mode}|${hwFilter}|${selectedGenre}|${sort}|${baseFiltered.map((g) => g.slug).join(",")}`;

  return (
    <div className="space-y-5">
      {/* ── 1. Genre Quick-Select Buttons (Pills with count below) ──── */}
      <div className="no-scrollbar -mx-1 flex snap-x items-center gap-2 overflow-x-auto px-1 py-1">
        <button
          type="button"
          onClick={() => setSelectedGenre("")}
          className={cn(
            "shrink-0 flex flex-col items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition-all duration-150 border leading-tight min-w-[70px]",
            selectedGenre === ""
              ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
              : "border-border/70 bg-secondary/50 text-foreground hover:border-border hover:bg-secondary/80"
          )}
        >
          <span>All</span>
          <span
            className={cn(
              "text-[11px] font-semibold tabular-nums mt-0.5",
              selectedGenre === ""
                ? "text-primary-foreground/80"
                : "text-muted-foreground"
            )}
          >
            {baseFiltered.length}
          </span>
        </button>

        {allGenresWithCounts.map(({ name, count }) => {
          const isSelected = selectedGenre === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelectedGenre(isSelected ? "" : name)}
              className={cn(
                "shrink-0 flex flex-col items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition-all duration-150 border leading-tight min-w-[70px]",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "border-border/70 bg-secondary/50 text-foreground hover:border-border hover:bg-secondary/80"
              )}
            >
              <span>{name}</span>
              <span
                className={cn(
                  "text-[11px] font-semibold tabular-nums mt-0.5",
                  isSelected
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 2. Unified Filter Rows (Stacked in 2 Rows) ── */}
      <div className="relative z-30 flex flex-col gap-2.5 rounded-xl border border-border/70 bg-card/60 p-3 backdrop-blur-sm">
        {/* Row 1: Sort + Performance + Game Count */}
        <div className="flex flex-wrap items-center justify-between gap-3.5">
          <div className="flex flex-wrap items-center gap-3.5">
            {/* Sort Dropdown with separate label */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                Sort:
              </span>
              <PremiumSelect
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="!w-auto h-8 min-w-[130px] rounded-lg border border-border/80 bg-secondary/50 px-2.5 text-xs font-semibold outline-none transition-colors hover:border-border focus:border-ring"
              >
                <option value="name">Name (A-Z)</option>
                <option value="size">Size (Largest)</option>
                <option value="players">Most Players</option>
              </PremiumSelect>
            </div>

            {/* Performance on my PC Dropdown with separate label */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                Performance on my PC:
              </span>
              <PremiumSelect
                value={hwFilter}
                onChange={(e) => {
                  const v = e.target.value as HwFilter;
                  if (!userHw && v) {
                    setHwFilter("");
                    window.alert(
                      "Open PlayBound while signed in to sync your PC, then use this filter."
                    );
                    return;
                  }
                  setHwFilter(v);
                }}
                className="!w-auto h-8 min-w-[110px] rounded-lg border border-border/80 bg-secondary/50 px-2.5 text-xs font-semibold outline-none transition-colors hover:border-border focus:border-ring"
                title={
                  userHw
                    ? "Filter by performance on your synced PC"
                    : "Filter by performance on your synced PC (open the launcher while signed in)"
                }
              >
                <option value="">Any</option>
                <option value="great">{userHw ? "Great" : "Great (needs launcher)"}</option>
                <option value="playable">
                  {userHw ? "Playable or better" : "Playable or better (needs launcher)"}
                </option>
              </PremiumSelect>
            </div>
          </div>

          {/* Total Games Count */}
          <div className="ml-auto pr-1 text-xs font-bold text-muted-foreground tabular-nums">
            {totalDisplayCount} game{totalDisplayCount === 1 ? "" : "s"}
          </div>
        </div>

        {/* Row 2: Secondary Checkbox Filters */}
        <div className="flex items-center gap-3.5 border-t border-border/40 pt-2 pl-0.5">
          <Checkbox
            checked={multiplayerOnly}
            onCheckedChange={setMultiplayerOnly}
            label="Multiplayer"
          />
          <Checkbox
            checked={hasPlayersOnly}
            onCheckedChange={setHasPlayersOnly}
            label="Has Players"
          />
        </div>
      </div>

      {/* ── 3. Genre Game Rows ─────────────────────────────────── */}
      {genreSections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 p-12 text-center">
          <p className="text-base font-semibold text-foreground">No games match your filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your sorting, hardware preference, or category filters.
          </p>
        </div>
      ) : (
        <CompatibleGamesFade animKey={animKey}>
          <div className="space-y-8">
            {genreSections.map(({ genre, games: rowGames }) => (
              <GenreGameRow
                key={genre}
                genre={genre}
                games={rowGames}
                playingNowBySlug={playingNowBySlug}
              />
            ))}
          </div>
        </CompatibleGamesFade>
      )}
    </div>
  );
}
