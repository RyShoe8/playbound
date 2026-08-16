"use client";

import type { Game } from "@/lib/data/types";
import { hasChoosableEditions, type Edition } from "@/lib/editionTypes";
import { EditionCard } from "./EditionCard";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import {
  isEditionCompatible,
  sortEditionsByCompatibility,
} from "@/lib/compatibility/compatibility";

/**
 * The "Available Editions" block on a game page.
 *
 * Hidden entirely when a game has only its synthesized Official edition:
 * a section listing one generated row would add noise to every game that has
 * never been given real editions, which is most of the catalog today.
 */
export function EditionsSection({
  game,
  editions,
  playingNowBySlug,
}: {
  game: Game;
  editions: Edition[];
  playingNowBySlug?: Record<string, number>;
}) {
  const { mode, device } = useCompatibilityFilter();

  if (!hasChoosableEditions(editions)) return null;

  const visible =
    mode === "compatible"
      ? editions.filter((edition) => isEditionCompatible(edition, game, device.type))
      : sortEditionsByCompatibility(editions, game, device.type);

  if (visible.length === 0) return null;

  return (
    <section id="editions" className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Available editions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {visible.length} way{visible.length === 1 ? "" : "s"} to play {game.title}. Each has its
          own install, community and verification status.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {visible.map((edition) => (
          <EditionCard
            key={edition.id}
            game={game}
            edition={edition}
            playingNow={playingNowBySlug?.[edition.slug]}
          />
        ))}
      </div>
    </section>
  );
}
