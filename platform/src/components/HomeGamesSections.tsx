"use client";

import type { Game } from "@/lib/data/types";
import { CardRow, GameCard } from "@/components/GameCard";
import { CompatibilityListingBar } from "@/components/GameCompatibilityToggle";
import {
  CompatibleGamesFade,
  useFilteredGames,
} from "@/components/compatibility/useFilteredGames";
import { SectionHeader } from "@/components/ui/bits";

export function HomeGamesSections({
  featuredGames,
  gems,
}: {
  featuredGames: Game[];
  gems: Game[];
}) {
  const featured = useFilteredGames(featuredGames, { limit: 12 });
  const filteredGems = useFilteredGames(gems);
  const animKey = `${featured.map((g) => g.slug).join(",")}|${filteredGems.map((g) => g.slug).join(",")}`;

  return (
    <div className="space-y-12">
      <CompatibilityListingBar />

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
                className="opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
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
                  className="opacity-0 animate-[fadeIn_0.35s_ease_forwards]"
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
