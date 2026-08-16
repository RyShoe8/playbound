"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ModCardMod } from "@/lib/mods";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { ModCard } from "@/components/ModCard";
import { CompatibleGamesFade } from "@/components/compatibility/useFilteredGames";
import type { ModBaseGameInfo } from "@/components/ModsCatalog";

/**
 * The mods index, laid out like the games index.
 *
 * Replaces a per-game grouped list. Grouping was fine at a handful of mods but
 * turned browsing into scrolling once the catalog grew, and gave no way to
 * answer "what is there for this game" without hunting for its heading. The
 * game picker answers that directly, and search covers everything else.
 */
export function ModsFilters({
  mods,
  gamesBySlug,
}: {
  mods: ModCardMod[];
  gamesBySlug: Record<string, ModBaseGameInfo | undefined>;
}) {
  const { mode, device } = useCompatibilityFilter();
  const [query, setQuery] = useState("");
  const [gameSlug, setGameSlug] = useState("");

  /** Only games that actually have mods — an empty option helps nobody. */
  const gameOptions = useMemo(() => {
    const slugs = new Set(mods.map((m) => m.baseGameSlug));
    return [...slugs]
      .map((slug) => ({ slug, title: gamesBySlug[slug]?.title ?? slug }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [mods, gamesBySlug]);

  const filtered = useMemo(() => {
    let list = mods;

    // Compatibility is judged by the base game, since that is what has to run.
    if (mode !== "all") {
      list = list.filter((m) => {
        const game = gamesBySlug[m.baseGameSlug];
        return game ? isGameCompatible(game, device.type) : false;
      });
    }

    if (gameSlug) {
      list = list.filter((m) => m.baseGameSlug === gameSlug);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const game = gamesBySlug[m.baseGameSlug];
        // The base game's title is searched too: people look for "OpenRA mods"
        // by typing the game, not the mod.
        return [m.title, m.tagline, game?.title]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      });
    }

    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [mods, gamesBySlug, mode, device.type, gameSlug, query]);

  const animKey = `${mode}|${gameSlug}|${filtered.map((m) => m.slug).join(",")}`;

  return (
    <>
      {/* ── Filter toolbar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search mods or games…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search mods"
            className="h-9 w-full rounded-lg border border-input bg-secondary/50 pr-3 pl-9 text-sm font-medium outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring"
          />
        </div>

        <PremiumSelect
          value={gameSlug}
          onChange={(e) => setGameSlug(e.target.value)}
          aria-label="Filter by game"
          className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm font-semibold outline-none transition-colors focus:border-ring"
        >
          <option value="">All games</option>
          {gameOptions.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.title}
            </option>
          ))}
        </PremiumSelect>
      </div>

      {/* ── Count ────────────────────────────────────────────── */}
      <p className="mt-2.5 text-sm font-medium text-muted-foreground">
        {filtered.length} mod{filtered.length === 1 ? "" : "s"}
        {mode === "compatible" ? " for games compatible with this device" : ""}
      </p>

      {/* ── Grid ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {mode === "compatible" && !query && !gameSlug
            ? "No mods for compatible games right now. Switch to All Games to browse everything."
            : "No mods match your filters."}
        </p>
      ) : (
        <CompatibleGamesFade animKey={animKey}>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
            {filtered.map((mod) => {
              const game = gamesBySlug[mod.baseGameSlug];
              return (
                <li key={mod.slug}>
                  <ModCard
                    mod={mod}
                    baseGame={
                      game
                        ? { slug: game.slug, title: game.title, coverImage: game.coverImage }
                        : null
                    }
                    meta={[mod.license, mod.sizeMB ? `~${mod.sizeMB} MB` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                </li>
              );
            })}
          </ul>
        </CompatibleGamesFade>
      )}
    </>
  );
}
