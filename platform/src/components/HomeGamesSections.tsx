"use client";

import type { Game } from "@/lib/data/types";
import { CardRow, GameCard } from "@/components/GameCard";
import {
  CompatibleGamesFade,
  useFilteredGames,
} from "@/components/compatibility/useFilteredGames";
import { SectionHeader } from "@/components/ui/bits";

const FEATURED_GAMES_LIMIT = 12;

export function HomeGamesSections({
  games,
  gems,
}: {
  /** Full published catalog — filtered client-side to match Discover. */
  games: Game[];
  gems: Game[];
}) {
  const featured = useFilteredGames(games, { limit: FEATURED_GAMES_LIMIT });
  const filteredGems = useFilteredGames(gems);
  const animKey = `${featured.map((g) => g.slug).join(",")}|${filteredGems.map((g) => g.slug).join(",")}`;

  return (
    <div className="space-y-12">
      <CompatibleGamesFade animKey={animKey} className="space-y-12">
        <section>
          <SectionHeader
            title="Games"
            subtitle={`${featured.length} free titles — a sample of what's on PlayBound`}
            href="/discover"
          />
          <CardRow>
            {featured.map((g, i) => (
              <div
                key={g.slug}
                className="h-full opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <GameCard game={g} />
              </div>
            ))}
          </CardRow>
        </section>

        {filteredGems.length > 0 && (
          <section>
            <SectionHeader
              title="Hidden Gems"
              subtitle="Editor picks — criminally underplayed, genuinely excellent"
              href="/discover?filter=hidden"
            />
            <CardRow>
              {filteredGems.map((g, i) => (
                <div
                  key={g.slug}
                  className="h-full opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <GameCard game={g} />
                </div>
              ))}
            </CardRow>
          </section>
        )}
      </CompatibleGamesFade>
    </div>
  );
}
