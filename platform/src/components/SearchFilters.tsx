"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { GENRES, TAGS, PLATFORMS, FEATURES } from "@/lib/gamePayload";
import { useTelemetry } from "@/lib/telemetry";

type SortOption = "title" | "releaseYear" | "sizeMB";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: "Title", value: "title" },
  { label: "Release Year", value: "releaseYear" },
  { label: "Size", value: "sizeMB" },
];

function FilterChip({
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
      className={`rounded-full px-6 py-2 text-sm font-semibold transition-all duration-200 ${
        active
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
          : "border border-border bg-secondary/50 text-secondary-foreground hover:border-primary/30 hover:bg-secondary"
      }`}
    >
      {label}
    </button>
  );
}

export function SearchFilters({
  query = "",
  resultCount = null,
}: {
  query?: string;
  resultCount?: number | null;
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

  const genreSet = useMemo(() => new Set(genres), [genres]);
  const tagSet = useMemo(() => new Set(tags), [tags]);
  const platformSet = useMemo(() => new Set(platforms), [platforms]);
  const featureSet = useMemo(() => new Set(features), [features]);

  const activeFilterCount = genres.length + tags.length + platforms.length + features.length;

  const buildUrl = useCallback(
    (overrides: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams();
      const values: Record<string, string | string[]> = {
        q,
        genre: genres,
        tag: tags,
        platform: platforms,
        feature: features,
        sort,
        sortDir,
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
    [q, genres, tags, platforms, features, sort, sortDir]
  );

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
  function clearFilters() {
    void track("filter_changed", { surface: "search", filters: { cleared: true } });
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`/search?${params.toString()}`);
  }

  const resultLabel =
    resultCount == null
      ? "Search games, developers, and collections — or use the filters above."
      : `${resultCount} result${resultCount === 1 ? "" : "s"}${q ? ` for “${q}”` : ""}`;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-4 backdrop-blur-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <SlidersHorizontal className="size-4 text-primary" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {activeFilterCount}
            </span>
          )}
        </h2>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3" /> Clear all
          </button>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Genres
        </p>
        <div className="flex flex-wrap gap-3">
          {GENRES.map((g) => (
            <FilterChip key={g} label={g} active={genreSet.has(g)} onClick={() => toggleGenre(g)} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tags
        </p>
        <div className="flex flex-wrap gap-3">
          {TAGS.map((t) => (
            <FilterChip key={t} label={t} active={tagSet.has(t)} onClick={() => toggleTag(t)} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Platforms
        </p>
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map((p) => (
            <FilterChip key={p} label={p} active={platformSet.has(p)} onClick={() => togglePlatform(p)} />
          ))}
        </div>
      </div>

      <details className="group">
        <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
          Features
          {features.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
              {features.length}
            </span>
          )}
        </summary>
        <div className="flex flex-wrap gap-3">
          {FEATURES.map((f) => (
            <FilterChip
              key={f}
              label={f}
              active={featureSet.has(f)}
              onClick={() => toggleFeature(f)}
            />
          ))}
        </div>
      </details>

      <div className="flex flex-col gap-4 border-t border-border/50 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sort by
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {SORT_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                active={sort === o.value}
                onClick={() => setSort(o.value)}
              />
            ))}
            <FilterChip
              label={sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
              active
              onClick={toggleSortDir}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <h1 className="text-2xl font-extrabold tracking-tight">Search</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{resultLabel}</p>
        </div>
      </div>
    </div>
  );
}
