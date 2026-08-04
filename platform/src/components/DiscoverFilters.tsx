"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import type { Game, Genre } from "@/lib/data/types";
import { useTelemetry } from "@/lib/telemetry";

/* ── Types ─────────────────────────────────────────────────── */

type SortOption = "name" | "size";

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
}

/* ── Helpers ────────────────────────────────────────────────── */

function sizeLabel(sizeMB: number) {
  return sizeMB >= 1000 ? `${(sizeMB / 1000).toFixed(1)} GB` : `${sizeMB} MB`;
}

/* ── CatalogCard — matches app's game-card layout ────────── */

function CatalogCard({ game }: { game: SerializedGame }) {
  const bgGrad = `linear-gradient(135deg, ${game.art.from}, ${game.art.to})`;

  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col overflow-hidden rounded-[14px] border border-border bg-card transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-[var(--border-focus,oklch(1_0_0/18%))] hover:bg-[var(--bg-card-hover,oklch(0.24_0.018_278))] hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
    >
      {/* Banner */}
      <div
        className="relative flex h-[120px] items-center justify-center overflow-hidden text-[32px] font-black text-white/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]"
        style={{ background: bgGrad }}
      >
        {game.coverImage ? (
          <Image
            src={game.coverImage}
            alt=""
            fill
            unoptimized={/^https?:\/\//i.test(game.coverImage)}
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
        ) : (
          (game.title || "?").charAt(0)
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-[16px] font-bold leading-tight">
          {game.title}
        </p>
        <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {game.tagline}
        </p>
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
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState<SortOption>("name");
  const [multiplayerOnly, setMultiplayerOnly] = useState(false);
  const [installableOnly, setInstallableOnly] = useState(false);
  const skipFirstFilter = useRef(true);

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

    if (sort === "size") {
      list.sort((a, b) => b.sizeMB - a.sizeMB);
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return list;
  }, [serialized, query, genre, sort, multiplayerOnly, installableOnly]);

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
        filters: { genre, sort, multiplayerOnly, installableOnly, query: q || undefined },
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [query, genre, sort, multiplayerOnly, installableOnly, filtered.length, track]);

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
        <select
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
        </select>

        {/* Sort dropdown */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm font-semibold outline-none transition-colors focus:border-ring"
        >
          <option value="name">Sort: Name</option>
          <option value="size">Sort: Size</option>
        </select>

        {/* Checkboxes */}
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
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
          {filtered.map((g) => (
            <CatalogCard key={g.slug} game={g} />
          ))}
        </div>
      )}
    </>
  );
}
