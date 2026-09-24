"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { PremiumSelect } from "@/components/ui/PremiumSelect";
import { Checkbox } from "@/components/ui/Checkbox";
import type { Genre } from "@/lib/data/types";
import type { DiscoverListingGame } from "@/lib/discoverListing";
import { evaluateCompatibility } from "@/lib/hardware/compatibility";
import { useTelemetry } from "@/lib/telemetry";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { useAccessTiers } from "@/components/AccessTiersProvider";
import { filterGamesByMode } from "@/lib/access/discoveryMode";
import { filterGamesForPreference } from "@/lib/compatibility/compatibility";
import { CompatibleGamesFade } from "@/components/compatibility/useFilteredGames";
import { GenreGameRow } from "@/components/GenreGameRow";
import { cn } from "@/lib/utils";
import { supportsMultiplayer } from "@/lib/multiplayer/support";
import { TAGS, FEATURES } from "@/lib/gamePayload";

/*
 * The filterable tag vocabulary, shared with /search.
 *
 * Both pages previously built this list their own way — /search from
 * TAGS, /discover from whatever strings the catalog happened to contain —
 * so the two filter panels never offered the same choices. Reading the one
 * constant is what keeps them honest; widening the vocabulary is an edit to
 * TAGS, which both pages then pick up.
 */
const CANONICAL_TAGS = new Set<string>(TAGS);

/*
 * Same contract for features. Counting these straight from the games was
 * safe while every feature in the catalog was also in FEATURES, but that
 * made the constant unable to retire anything: dropping a feature from it
 * removed the chip from /search and left it on /discover. Reading the
 * constant here is what lets a feature actually be retired in one place.
 */
const CANONICAL_FEATURES = new Set<string>(FEATURES);

/* ── Types ─────────────────────────────────────────────────── */

type SortOption = "name" | "players";
type HwFilter = "" | "great" | "playable";

/* ── Main component ─────────────────────────────────────────── */

export function DiscoverFilters({
  games,
}: {
  games: DiscoverListingGame[];
}) {
  const [playingNowBySlug, setPlayingNowBySlug] = useState<Record<string, number>>({});
  const { track } = useTelemetry();
  const { mode, device } = useCompatibilityFilter();
  const { mode: discoveryMode } = useDiscoveryMode();
  const tiers = useAccessTiers();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const allCatalogGenres = useMemo(() => Array.from(new Set(games.flatMap((g) => g.genres))), [games]);
  const allCatalogTags = useMemo(() => Array.from(new Set(games.flatMap((g) => g.tags))), [games]);
  const allCatalogFeatures = useMemo(() => Array.from(new Set(games.flatMap((g) => g.features))), [games]);

  const initialGenre = useMemo(() => {
    const raw = searchParams.get("genre") || searchParams.get("genres") || "";
    if (!raw) return "";
    const match = allCatalogGenres.find((gen) => gen.toLowerCase() === raw.toLowerCase());
    return match || raw;
  }, [searchParams, allCatalogGenres]);

  const initialTags = useMemo(() => {
    const fromMultiple = searchParams.getAll("tag");
    const fromComma = searchParams.get("tags")?.split(",") || [];
    const raw = [...fromMultiple, ...fromComma].map((t) => t.trim()).filter(Boolean);
    if (raw.length === 0) return [];
    return raw.map((t) => allCatalogTags.find((ct) => ct.toLowerCase() === t.toLowerCase()) || t);
  }, [searchParams, allCatalogTags]);

  const initialFeatures = useMemo(() => {
    const fromMultiple = searchParams.getAll("feature");
    const fromComma = searchParams.get("features")?.split(",") || [];
    const raw = [...fromMultiple, ...fromComma].map((f) => f.trim()).filter(Boolean);
    if (raw.length === 0) return [];
    return raw.map((f) => allCatalogFeatures.find((cf) => cf.toLowerCase() === f.toLowerCase()) || f);
  }, [searchParams, allCatalogFeatures]);

  const [selectedGenre, setSelectedGenre] = useState<string>(() => initialGenre);
  const [tagsOpen, setTagsOpen] = useState(() => initialTags.length > 0);
  const [selectedTags, setSelectedTags] = useState<string[]>(() => initialTags);
  const [featuresOpen, setFeaturesOpen] = useState(() => initialFeatures.length > 0);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(() => initialFeatures);
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

  // Player counts can require a cold master-server fan-out. Let the catalog
  // paint first, then fill the badges and player filter from the shared snapshot.
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/launcher/live-stats", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((stats) => {
        if (!stats || controller.signal.aborted || !Array.isArray(stats.byGame)) return;
        const counts: Record<string, number> = {};
        for (const game of stats.byGame) {
          if (typeof game.slug === "string") counts[game.slug] = Number(game.playingNow) || 0;
        }
        setPlayingNowBySlug(counts);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

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

  /* Filter games based on current filter states (before genre split) */
  const baseFiltered = useMemo(() => {
    let list = games.slice();

    /*
     * Every selected tag must match, not any. Tags describe what a game is
     * ("Co-op", "Roguelite"), so narrowing is what picking a second one is
     * for — an "any" match would widen the results and read as broken.
     */
    if (selectedFeatures.length > 0) {
      const wanted = selectedFeatures.map((f) => f.toLowerCase());
      list = list.filter((g) => {
        const has = new Set(g.features.map((f) => f.toLowerCase()));
        return wanted.every((f) => has.has(f));
      });
    }

    if (selectedTags.length > 0) {
      const wanted = selectedTags.map((t) => t.toLowerCase());
      list = list.filter((g) => {
        const has = new Set(g.tags.map((t) => t.toLowerCase()));
        return wanted.every((t) => has.has(t));
      });
    }

    /*
     * The shared rule, not a local one. This filter used to test for the
     * literal substring "multiplayer", so a co-op-only game was multiplayer
     * everywhere on the site except here — hidden by the very filter meant to
     * surface it.
     */
    if (multiplayerOnly) {
      list = list.filter((g) => supportsMultiplayer(g));
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

    if (discoveryMode === "FREE") {
      list = filterGamesByMode(list, "FREE", tiers);
    }

    list = filterGamesForPreference(list, mode, device.type);

    if (sort === "players") {
      list.sort(
        (a, b) => (playingNowBySlug[b.slug] ?? 0) - (playingNowBySlug[a.slug] ?? 0) || a.title.localeCompare(b.title)
      );
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return list;
  }, [
    games,
    selectedTags,
    selectedFeatures,
    multiplayerOnly,
    hasPlayersOnly,
    hwFilter,
    userHw,
    discoveryMode,
    tiers,
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

  /*
   * Tags available to pick, counted within the current results.
   *
   * Selected tags are always included even at zero, because a tag that
   * narrowed the list to nothing would otherwise vanish and leave no way to
   * undo it.
   */
  const allTagsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of baseFiltered) {
      for (const t of g.tags) {
        // Vocabulary, not free text. Games carry 152 distinct tags between
        // them and 96 of those appear exactly once, so counting every string
        // turned this panel into a wall of chips that mostly matched a single
        // game — and none of them existed on /search, which reads TAGS.
        if (!CANONICAL_TAGS.has(t)) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    // A tag already picked stays visible even at zero, or a filter that
    // narrowed the list to nothing would vanish with no way to undo it.
    for (const t of selectedTags) if (!counts.has(t)) counts.set(t, 0);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [baseFiltered, selectedTags]);

  /*
   * Features, counted the same way and kept separate from tags.
   *
   * They answer different questions — a tag says what a game is like, a feature
   * says what it supports — and merging them into one list made "Co-op" and
   * "Roguelite" look like the same kind of choice.
   *
   * Features are still counted straight from the games, and that is safe here:
   * every feature the catalog uses is already in FEATURES, so there is no
   * off-vocabulary leak to filter out. Tags are the opposite case and are
   * restricted to CANONICAL_TAGS above. Counting keeps both honest either way
   * — a value with no matches in the current results is never offered.
   */
  const allFeaturesWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of baseFiltered) {
      for (const f of g.features) {
        if (!CANONICAL_FEATURES.has(f)) continue;
        counts.set(f, (counts.get(f) ?? 0) + 1);
      }
    }
    for (const f of selectedFeatures) if (!counts.has(f)) counts.set(f, 0);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [baseFiltered, selectedFeatures]);

  const syncUrl = useCallback(
    (updates: { genre?: string; tags?: string[]; features?: string[] }) => {
      const g = updates.genre !== undefined ? updates.genre : selectedGenre;
      const t = updates.tags !== undefined ? updates.tags : selectedTags;
      const f = updates.features !== undefined ? updates.features : selectedFeatures;

      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      if (g) {
        params.set("genre", g);
        params.delete("genres");
      } else {
        params.delete("genre");
        params.delete("genres");
      }

      params.delete("tag");
      if (t.length > 0) {
        params.set("tags", t.join(","));
      } else {
        params.delete("tags");
      }

      params.delete("feature");
      if (f.length > 0) {
        params.set("features", f.join(","));
      } else {
        params.delete("features");
      }

      const qs = params.toString();
      const nextUrl = qs ? `${pathname}?${qs}` : pathname;
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", nextUrl);
      }
    },
    [pathname, selectedGenre, selectedTags, selectedFeatures]
  );

  function handleSelectGenre(name: string) {
    const next = selectedGenre === name ? "" : name;
    setSelectedGenre(next);
    syncUrl({ genre: next });
  }

  function toggleFeature(name: string) {
    const next = selectedFeatures.includes(name)
      ? selectedFeatures.filter((f) => f !== name)
      : [...selectedFeatures, name];
    setSelectedFeatures(next);
    syncUrl({ features: next });
  }

  function clearFeatures() {
    setSelectedFeatures([]);
    syncUrl({ features: [] });
  }

  function toggleTag(name: string) {
    const next = selectedTags.includes(name)
      ? selectedTags.filter((t) => t !== name)
      : [...selectedTags, name];
    setSelectedTags(next);
    syncUrl({ tags: next });
  }

  function clearTags() {
    setSelectedTags([]);
    syncUrl({ tags: [] });
  }

  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const rawGenre = sp.get("genre") || sp.get("genres") || "";
      const matchedGenre = allCatalogGenres.find((gen) => gen.toLowerCase() === rawGenre.toLowerCase()) || rawGenre;
      setSelectedGenre(matchedGenre);

      const fromMultipleTags = sp.getAll("tag");
      const fromCommaTags = sp.get("tags")?.split(",") || [];
      const rawTags = [...fromMultipleTags, ...fromCommaTags].map((t) => t.trim()).filter(Boolean);
      const matchedTags = rawTags.map((t) => allCatalogTags.find((ct) => ct.toLowerCase() === t.toLowerCase()) || t);
      setSelectedTags(matchedTags);
      if (matchedTags.length > 0) setTagsOpen(true);

      const fromMultipleFeatures = sp.getAll("feature");
      const fromCommaFeatures = sp.get("features")?.split(",") || [];
      const rawFeatures = [...fromMultipleFeatures, ...fromCommaFeatures].map((f) => f.trim()).filter(Boolean);
      const matchedFeatures = rawFeatures.map((f) => allCatalogFeatures.find((cf) => cf.toLowerCase() === f.toLowerCase()) || f);
      setSelectedFeatures(matchedFeatures);
      if (matchedFeatures.length > 0) setFeaturesOpen(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [allCatalogGenres, allCatalogTags, allCatalogFeatures]);

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
      <div className="-mx-1 flex flex-wrap items-center gap-2 px-1 py-1">
        <button
          type="button"
          onClick={() => handleSelectGenre("")}
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
              onClick={() => handleSelectGenre(name)}
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

      {/* ── 1b. Tags and Features, on the same line, opening into the space below ── */}
      {(allTagsWithCounts.length > 0 || allFeaturesWithCounts.length > 0) && (
        <div className="-mt-2 space-y-2">
          <div className="flex items-center gap-4">
            {allTagsWithCounts.length > 0 && (
              <button
                type="button"
                onClick={() => setTagsOpen((v) => !v)}
                aria-expanded={tagsOpen}
                className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                <span
                  className={cn("inline-block transition-transform duration-150", tagsOpen && "rotate-90")}
                  aria-hidden
                >
                  ▸
                </span>
                Tags
                {selectedTags.length > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground tabular-nums">
                    {selectedTags.length}
                  </span>
                )}
              </button>
            )}

            {allFeaturesWithCounts.length > 0 && (
              <button
                type="button"
                onClick={() => setFeaturesOpen((v) => !v)}
                aria-expanded={featuresOpen}
                className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                <span
                  className={cn("inline-block transition-transform duration-150", featuresOpen && "rotate-90")}
                  aria-hidden
                >
                  ▸
                </span>
                Features
                {selectedFeatures.length > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground tabular-nums">
                    {selectedFeatures.length}
                  </span>
                )}
              </button>
            )}
          </div>

          {tagsOpen && (
            <ChipGrid
              items={allTagsWithCounts}
              selected={selectedTags}
              onPick={toggleTag}
              onClear={clearTags}
              clearLabel="Clear Tags"
            />
          )}

          {featuresOpen && (
            <ChipGrid
              items={allFeaturesWithCounts}
              selected={selectedFeatures}
              onPick={toggleFeature}
              onClear={clearFeatures}
              clearLabel="Clear Features"
            />
          )}
        </div>
      )}

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

/**
 * Grid of clickable filter chips with counts.
 */
function ChipGrid({
  items,
  selected,
  onPick,
  onClear,
  clearLabel = "Clear",
}: {
  items: { name: string; count: number }[];
  selected: string[];
  onPick: (name: string) => void;
  onClear: () => void;
  clearLabel?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="-mx-1 flex flex-wrap items-center gap-2 px-1">
      {items.map(({ name, count }) => {
        const isSelected = selected.includes(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            aria-pressed={isSelected}
            className={cn(
              "shrink-0 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "border-border/70 bg-secondary/50 text-foreground hover:border-border hover:bg-secondary/80"
            )}
          >
            {name}
            <span
              className={cn(
                "ml-2 tabular-nums",
                isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-primary hover:underline"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
