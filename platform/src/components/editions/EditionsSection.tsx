import type { Game } from "@/lib/data/types";
import type { Edition } from "@/lib/editionTypes";
import { EditionCard } from "./EditionCard";

/**
 * The "Available Editions" block on a game page.
 *
 * Hidden entirely when a game has only its synthesized Official edition:
 * a section listing one generated row would add noise to every game that has
 * never been given real editions, which is most of the catalog today.
 */
export function EditionsSection({ game, editions }: { game: Game; editions: Edition[] }) {
  const onlyVirtual = editions.length === 1 && editions[0]?.virtual;
  if (editions.length === 0 || onlyVirtual) return null;

  return (
    <section id="editions" className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Available editions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {editions.length} ways to play {game.title}. Each has its own install, community and
          verification status.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {editions.map((edition) => (
          <EditionCard key={edition.id} game={game} edition={edition} />
        ))}
      </div>
    </section>
  );
}
