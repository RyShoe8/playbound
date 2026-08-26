"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useEffect } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  Coins,
  Gamepad2,
  MonitorSmartphone,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { GENRES, TAGS, PLATFORMS, FEATURES } from "@/lib/gamePayload";
import type { DiscoveryMode } from "@/lib/access/discoveryMode";
import { useTelemetry } from "@/lib/telemetry";
import { cn } from "@/lib/utils";

type SortOption = "title" | "releaseYear" | "players" | "plays";
type SortDir = "asc" | "desc";

const PRICE_OPTIONS: { label: string; value: string }[] = [
  { label: "Any", value: "any" },
  { label: "Free", value: "free" },
  { label: "Under $5", value: "under5" },
  { label: "Under $10", value: "under10" },
  { label: "Under $15", value: "under15" },
];

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: "Title", value: "title" },
  { label: "Release Year", value: "releaseYear" },
  { label: "Players", value: "players" },
  { label: "Plays", value: "plays" },
];

function CompactFilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95",
        active
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30 ring-1 ring-primary"
          : "border border-border bg-secondary/50 text-secondary-foreground hover:border-primary/40 hover:bg-secondary"
      )}
    >
      {label}
    </button>
  );
}

function SectionToggle({
  title,
  icon: Icon,
  activeCount = 0,
  isOpen,
  onToggle,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  activeCount?: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between py-2 text-left transition-colors hover:text-foreground"
    >
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {title}
        {activeCount > 0 && (
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-extrabold text-primary">
            {activeCount}
          </span>
        )}
      </span>
      <ChevronDown
        className={cn(
          "size-4 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180 text-primary"
        )}
      />
    </button>
  );
}

export function SearchFilters({
  query = "",
  resultCount = null,
  discoveryMode = "ALL",
}: {
  query?: string;
  resultCount?: number | null;
  discoveryMode?: DiscoveryMode;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const { track } = useTelemetry();

  const q = sp.get("q") ?? query;
  const genres = useMemo(() => sp.getAll("genre"), [sp]);
  const tags = useMemo(() => sp.getAll("tag"), [sp]);
  const platforms = useMemo(() => sp.getAll("platform"), [sp]);
  const features = useMemo(() => sp.getAll("feature"), [sp]);
  const sort = (sp.get("sort") ?? "title") as SortOption;
  const sortDir = (sp.get("sortDir") ?? "asc") as SortDir;
  const price = sp.get("price") ?? "any";

  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  const genreSet = useMemo(() => new Set(genres), [genres]);
  const tagSet = useMemo(() => new Set(tags), [tags]);
  const platformSet = useMemo(() => new Set(platforms), [platforms]);
  const featureSet = useMemo(() => new Set(features), [features]);

  const activePriceCount = discoveryMode === "ALL" && price !== "any" ? 1 : 0;
  const hasSortOverride = sort !== "title" || sortDir !== "asc";

  const activeFilterCount =
    genres.length +
    tags.length +
    platforms.length +
    features.length +
    activePriceCount +
    (hasSortOverride ? 1 : 0);

  // Sections with active selections start open; others start collapsed
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => ({
    genres: genres.length > 0,
    tags: tags.length > 0,
    platforms: platforms.length > 0,
    features: features.length > 0,
    price: activePriceCount > 0,
    sort: hasSortOverride,
  }));

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allOpen = Object.values(openSections).every(Boolean);
  const toggleAll = () => {
    const nextState = !allOpen;
    setOpenSections({
      genres: nextState,
      tags: nextState,
      platforms: nextState,
      features: nextState,
      price: nextState,
      sort: nextState,
    });
  };

  const buildUrl = useCallback(
    (overrides: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams();
      const values: Record<string, string | string[] | null> = {
        q,
        genre: genres,
        tag: tags,
        platform: platforms,
        feature: features,
        sort,
        sortDir,
        price: discoveryMode === "ALL" && price !== "any" ? price : null,
        ...overrides,
      };
      for (const [key, val] of Object.entries(values)) {
        if (val == null) continue;
        if (Array.isArray(val)) {
          for (const v of val) {
            if (v) params.append(key, v);
          }
        } else if (val) {
          params.set(key, val);
        }
      }
      if (params.get("sort") === "title") params.delete("sort");
      if (params.get("sortDir") === "asc") params.delete("sortDir");
      return `/search?${params.toString()}`;
    },
    [q, genres, tags, platforms, features, sort, sortDir, price, discoveryMode]
  );

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const queryTerm = searchInput.trim();
    if (queryTerm) void track("search", { query: queryTerm });
    router.push(buildUrl({ q: queryTerm || null }));
  }

  function handleClearSearch() {
    setSearchInput("");
    router.push(buildUrl({ q: null }));
  }

  function toggleInArray(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  function toggleGenre(g: string) {
    const next = toggleInArray(genres, g);
    void track("filter_changed", { surface: "search", filters: { genre: next } });
    router.push(buildUrl({ genre: next }));
  }
  function toggleTag(t: string) {
    const next = toggleInArray(tags, t);
    void track("filter_changed", { surface: "search", filters: { tag: next } });
    router.push(buildUrl({ tag: next }));
  }
  function togglePlatform(p: string) {
    const next = toggleInArray(platforms, p);
    void track("filter_changed", { surface: "search", filters: { platform: next } });
    router.push(buildUrl({ platform: next }));
  }
  function toggleFeature(f: string) {
    const next = toggleInArray(features, f);
    void track("filter_changed", { surface: "search", filters: { feature: next } });
    router.push(buildUrl({ feature: next }));
  }
  function setSort(s: SortOption) {
    void track("filter_changed", { surface: "search", filters: { sort: s } });
    router.push(buildUrl({ sort: s }));
  }
  function toggleSortDir() {
    const next = sortDir === "asc" ? "desc" : "asc";
    void track("filter_changed", { surface: "search", filters: { sortDir: next } });
    router.push(buildUrl({ sortDir: next }));
  }
  function setPrice(next: string) {
    void track("filter_changed", { surface: "search", filters: { price: next } });
    router.push(buildUrl({ price: next === "any" ? null : next }));
  }
  function clearFilters() {
    void track("filter_changed", { surface: "search", filters: { cleared: true } });
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`/search?${params.toString()}`);
  }

  const resultLabel =
    resultCount == null
      ? "Search games, developers, and collections — or use the filters below."
      : `${resultCount} result${resultCount === 1 ? "" : "s"}${q ? ` for “${q}”` : ""}`;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-3.5 backdrop-blur-md sm:p-5">
      {/* Search Input and Top Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search games, developers, collections…"
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full rounded-xl border border-input bg-secondary/80 pr-9 pl-10 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground transition-colors focus:border-ring focus:bg-secondary focus:ring-2 focus:ring-ring/40"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search text"
            >
              <X className="size-4" />
            </button>
          )}
        </form>

        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-lg border border-border/80 bg-secondary/40 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <X className="size-3" /> Clear all ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Pills Bar (Quick removal without drilling into collapsed sections) */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Active:
          </span>
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGenre(g)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
            >
              Genre: {g} <X className="size-3" />
            </button>
          ))}
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
            >
              Tag: {t} <X className="size-3" />
            </button>
          ))}
          {platforms.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
            >
              Platform: {p} <X className="size-3" />
            </button>
          ))}
          {features.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFeature(f)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
            >
              Feature: {f} <X className="size-3" />
            </button>
          ))}
          {activePriceCount > 0 && (
            <button
              type="button"
              onClick={() => setPrice("any")}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
            >
              Price: {PRICE_OPTIONS.find((o) => o.value === price)?.label ?? price} <X className="size-3" />
            </button>
          )}
          {hasSortOverride && (
            <button
              type="button"
              onClick={() => {
                setSort("title");
                if (sortDir !== "asc") toggleSortDir();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
            >
              Sort: {SORT_OPTIONS.find((o) => o.value === sort)?.label} ({sortDir === "asc" ? "Asc" : "Desc"}) <X className="size-3" />
            </button>
          )}
        </div>
      )}

      {/* Collapsible Filter Categories */}
      <div className="divide-y divide-border/40 rounded-xl border border-border/50 bg-secondary/20 px-3 py-1">
        {/* Genres */}
        <div>
          <SectionToggle
            title="Genres"
            icon={Gamepad2}
            activeCount={genres.length}
            isOpen={!!openSections.genres}
            onToggle={() => toggleSection("genres")}
          />
          {openSections.genres && (
            <div className="flex flex-wrap gap-1.5 pt-1 pb-3">
              {GENRES.map((g) => (
                <CompactFilterChip
                  key={g}
                  label={g}
                  active={genreSet.has(g)}
                  onClick={() => toggleGenre(g)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <SectionToggle
            title="Tags"
            icon={Tag}
            activeCount={tags.length}
            isOpen={!!openSections.tags}
            onToggle={() => toggleSection("tags")}
          />
          {openSections.tags && (
            <div className="flex flex-wrap gap-1.5 pt-1 pb-3">
              {TAGS.map((t) => (
                <CompactFilterChip
                  key={t}
                  label={t}
                  active={tagSet.has(t)}
                  onClick={() => toggleTag(t)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Platforms */}
        <div>
          <SectionToggle
            title="Platforms"
            icon={MonitorSmartphone}
            activeCount={platforms.length}
            isOpen={!!openSections.platforms}
            onToggle={() => toggleSection("platforms")}
          />
          {openSections.platforms && (
            <div className="flex flex-wrap gap-1.5 pt-1 pb-3">
              {PLATFORMS.map((p) => (
                <CompactFilterChip
                  key={p}
                  label={p}
                  active={platformSet.has(p)}
                  onClick={() => togglePlatform(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Features */}
        <div>
          <SectionToggle
            title="Features"
            icon={Sparkles}
            activeCount={features.length}
            isOpen={!!openSections.features}
            onToggle={() => toggleSection("features")}
          />
          {openSections.features && (
            <div className="flex flex-wrap gap-1.5 pt-1 pb-3">
              {FEATURES.map((f) => (
                <CompactFilterChip
                  key={f}
                  label={f}
                  active={featureSet.has(f)}
                  onClick={() => toggleFeature(f)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Price (if in ALL discovery mode) */}
        {discoveryMode === "ALL" && (
          <div>
            <SectionToggle
              title="Price"
              icon={Coins}
              activeCount={activePriceCount}
              isOpen={!!openSections.price}
              onToggle={() => toggleSection("price")}
            />
            {openSections.price && (
              <div className="flex flex-wrap gap-1.5 pt-1 pb-3">
                {PRICE_OPTIONS.map((o) => (
                  <CompactFilterChip
                    key={o.value}
                    label={o.label}
                    active={
                      price === o.value ||
                      (o.value === "any" &&
                        price !== "free" &&
                        price !== "under5" &&
                        price !== "under10" &&
                        price !== "under15")
                    }
                    onClick={() => setPrice(o.value)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sort */}
        <div>
          <SectionToggle
            title="Sort & Order"
            icon={ArrowUpDown}
            activeCount={hasSortOverride ? 1 : 0}
            isOpen={!!openSections.sort}
            onToggle={() => toggleSection("sort")}
          />
          {openSections.sort && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-3">
              {SORT_OPTIONS.map((o) => (
                <CompactFilterChip
                  key={o.value}
                  label={o.label}
                  active={sort === o.value}
                  onClick={() => setSort(o.value)}
                />
              ))}
              <CompactFilterChip
                label={sortDir === "asc" ? "↑ Ascending" : "↓ Descending"}
                active
                onClick={toggleSortDir}
              />
            </div>
          )}
        </div>
      </div>

      {/* Result Status Header */}
      <div className="flex items-center justify-between border-t border-border/40 pt-3">
        <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">Search Results</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">{resultLabel}</p>
      </div>
    </div>
  );
}

