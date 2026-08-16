"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import type { Game, Genre } from "@/lib/data/types";
import type { HardwareRequirementsBlock } from "@/lib/hardware/types";
import { evaluateCompatibility } from "@/lib/hardware/compatibility";
import { useTelemetry } from "@/lib/telemetry";
import { GamePlatformBadges } from "@/components/GamePlatformBadges";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import {
  filterGamesForPreference,
  incompatibilityBadge,
} from "@/lib/compatibility/compatibility";
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

/* ── Helpers ────────────────────────────────────────────────── */

function sizeLabel(sizeMB: number) {
  return sizeMB >= 1000 ? `${(sizeMB / 1000).toFixed(1)} GB` : `${sizeMB} MB`;
}

/* ── CatalogCard — matches app's game-card layout ────────── */

function CatalogCard({
  game,
  incompatibleLabel,
}: {
  game: SerializedGame;
  incompatibleLabel: string | null;
}) {
  const bgGrad = `linear-gradient(135deg, ${game.art.from}, ${game.art.to})`;

  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col overflow-hidden rounded-[14px] border border-border bg-card transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-[var(--border-focus,oklch(1_0_0/18%))] hover:bg-[var(--bg-card-hover,oklch(0.24_0.018_278))] hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
    >
      {/* Banner */}
      <div
        className="relative flex h-[138px] items-center justify-center overflow-hidden text-[32px] font-black text-white/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]"
        style={{ background: bgGrad }}
      >
        {game.coverImage ? (
          <Image
            src={game.coverImage}
            alt={`${game.title} cover art`}
            fill
            unoptimized={/^https?:\/\//i.test(game.coverImage)}
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
        ) : (
          (game.title || "?").charAt(0)
        )}
        {incompatibleLabel ? (
          <span className="absolute top-2 left-2 rounded-md border border-border/80 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {incompatibleLabel}
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-[16px] font-bold leading-tight">
          {game.title}
        </p>
        <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {game.tagline}
        </p>
        <GamePlatformBadges game={game} compact className="mt-2" />
        <div className="mt-3.5 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/70">
            {sizeLabel(game.sizeMB)}
          </span>
          <span className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-semibold text-secondary-foreground transition-colors group-hover:border-primary/30 group-hover:bg-secondary">
            View
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ── Main component ─────────────────────────────────────────── */

export function DiscoverFilters({ games }: { games: Game[] }) {
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
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
            {filtered.map((g, i) => (
              <div
                key={g.slug}
                className="opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <CatalogCard
                  game={g}
                  incompatibleLabel={
                    mode === "all" ? incompatibilityBadge(g, device.type) : null
                  }
                />
              </div>
            ))}
          </div>
        </CompatibleGamesFade>
      )}
    </>
  );
}
