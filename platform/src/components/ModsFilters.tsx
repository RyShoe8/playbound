"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useMemo, useState } from "react";
import type { ModCardMod } from "@/lib/mods";
import { isModCompatible } from "@/lib/compatibility/compatibility";
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

    if (mode !== "all") {
      list = list.filter((m) => {
        const game = gamesBySlug[m.baseGameSlug];
        return isModCompatible(m, game, device.type);
      });
    }

    if (gameSlug) {
      list = list.filter((m) => m.baseGameSlug === gameSlug);
    }

    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [mods, gamesBySlug, mode, device.type, gameSlug]);

  const animKey = `${mode}|${gameSlug}|${filtered.map((m) => m.slug).join(",")}`;

  return (
    <>
      {/* ── Filter toolbar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-2.5 backdrop-blur-sm sm:p-3">
        <div className="flex items-center gap-3">
          <PremiumSelect
            value={gameSlug}
            onChange={(e) => setGameSlug(e.target.value)}
            aria-label="Filter by game"
            className="!w-auto h-9 min-w-[160px] rounded-lg border border-border/80 bg-secondary/50 px-3 text-xs font-semibold outline-none transition-colors hover:border-border focus:border-ring"
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
        <p className="pr-1 text-xs font-bold text-muted-foreground tabular-nums">
          {filtered.length} mod{filtered.length === 1 ? "" : "s"}
          {mode === "compatible" ? " (compatible)" : ""}
        </p>
      </div>

      {/* ── Grid ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {mode === "compatible" && !gameSlug
            ? "No mods for compatible games right now. Switch to All Games to browse everything."
            : "No mods match your filters."}
        </p>
      ) : (
        <CompatibleGamesFade animKey={animKey}>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-5">
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
