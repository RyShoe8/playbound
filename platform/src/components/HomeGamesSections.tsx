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
  latest,
  popular,
}: {
  /** Newest published games first — filtered client-side to match Discover. */
  latest: Game[];
  /** Highest overall playtime first — filtered client-side to match Discover. */
  popular: Game[];
}) {
  const featured = useFilteredGames(latest, { limit: FEATURED_GAMES_LIMIT });
  const filteredPopular = useFilteredGames(popular, { limit: FEATURED_GAMES_LIMIT });
  const animKey = `${featured.map((g) => g.slug).join(",")}|${filteredPopular.map((g) => g.slug).join(",")}`;

  return (
    <div className="space-y-12">
      <CompatibleGamesFade animKey={animKey} className="space-y-12">
        <section>
          <SectionHeader
            title="Latest Games"
            subtitle="Recently added to the catalog"
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

        {filteredPopular.length > 0 && (
          <section>
            <SectionHeader
              title="Most Popular Games"
              subtitle="Ranked by total playtime on PlayBound"
              href="/discover"
            />
            <CardRow>
              {filteredPopular.map((g, i) => (
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
