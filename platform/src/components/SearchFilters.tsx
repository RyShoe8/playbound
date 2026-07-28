"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { GENRES, TAGS, PLATFORMS, FEATURES } from "@/lib/gamePayload";

type SortOption = "title" | "releaseYear" | "sizeMB";
type SortDir = "asc" | "desc";

const SIZE_OPTIONS = [
  { label: "Any size", value: "" },
  { label: "Under 200 MB", value: "200" },
  { label: "Under 500 MB", value: "500" },
  { label: "Under 1 GB", value: "1000" },
  { label: "Under 5 GB", value: "5000" },
  { label: "Under 10 GB", value: "10000" },
] as const;

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
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 ${
        active
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
          : "border border-border bg-secondary/50 text-secondary-foreground hover:border-primary/30 hover:bg-secondary"
      }`}
    >
      {label}
    </button>
  );
}

export function SearchFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  const q = sp.get("q") ?? "";
  const genres = useMemo(() => sp.getAll("genre"), [sp]);
  const tags = useMemo(() => sp.getAll("tag"), [sp]);
  const platforms = useMemo(() => sp.getAll("platform"), [sp]);
  const features = useMemo(() => sp.getAll("feature"), [sp]);
  const sort = (sp.get("sort") ?? "title") as SortOption;
  const sortDir = (sp.get("sortDir") ?? "asc") as SortDir;
  const maxSize = sp.get("maxSize") ?? "";

  const genreSet = useMemo(() => new Set(genres), [genres]);
  const tagSet = useMemo(() => new Set(tags), [tags]);
  const platformSet = useMemo(() => new Set(platforms), [platforms]);
  const featureSet = useMemo(() => new Set(features), [features]);

  const activeFilterCount =
    genres.length + tags.length + platforms.length + features.length + (maxSize ? 1 : 0);

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
        maxSize,
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
      // Remove defaults
      if (params.get("sort") === "title") params.delete("sort");
      if (params.get("sortDir") === "asc") params.delete("sortDir");
      return `/search?${params.toString()}`;
    },
    [q, genres, tags, platforms, features, sort, sortDir, maxSize]
  );

  function toggleInArray(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  function toggleGenre(g: string) {
    router.push(buildUrl({ genre: toggleInArray(genres, g) }));
  }
  function toggleTag(t: string) {
    router.push(buildUrl({ tag: toggleInArray(tags, t) }));
  }
  function togglePlatform(p: string) {
    router.push(buildUrl({ platform: toggleInArray(platforms, p) }));
  }
  function toggleFeature(f: string) {
    router.push(buildUrl({ feature: toggleInArray(features, f) }));
  }
  function setSort(s: SortOption) {
    router.push(buildUrl({ sort: s }));
  }
  function toggleSortDir() {
    router.push(buildUrl({ sortDir: sortDir === "asc" ? "desc" : "asc" }));
  }
  function setMaxSize(v: string) {
    router.push(buildUrl({ maxSize: v || null }));
  }
  function clearFilters() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`/search?${params.toString()}`);
  }

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

      {/* Genres */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Genres
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => (
            <FilterChip key={g} label={g} active={genreSet.has(g)} onClick={() => toggleGenre(g)} />
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tags
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <FilterChip key={t} label={t} active={tagSet.has(t)} onClick={() => toggleTag(t)} />
          ))}
        </div>
      </div>

      {/* Platforms */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Platforms
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => (
            <FilterChip key={p} label={p} active={platformSet.has(p)} onClick={() => togglePlatform(p)} />
          ))}
        </div>
      </div>

      {/* Features */}
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
        <div className="flex flex-wrap gap-1.5">
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

      {/* Sort & Size */}
      <div className="flex flex-wrap items-end gap-4 border-t border-border/50 pt-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sort by
          </p>
          <div className="flex items-center gap-1">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="h-8 rounded-lg border border-input bg-secondary/50 px-2.5 text-xs font-semibold outline-none focus:border-ring"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={toggleSortDir}
              className="flex h-8 items-center rounded-lg border border-input bg-secondary/50 px-2 text-xs font-semibold transition-colors hover:bg-secondary"
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Max size
          </p>
          <select
            value={maxSize}
            onChange={(e) => setMaxSize(e.target.value)}
            className="h-8 rounded-lg border border-input bg-secondary/50 px-2.5 text-xs font-semibold outline-none focus:border-ring"
          >
            {SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
