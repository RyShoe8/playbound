import type { Metadata } from "next";
import { listGames } from "@/lib/catalog";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { DiscoverFilters } from "@/components/DiscoverFilters";
import { getCatalogLiveStats, playingNowBySlug } from "@/lib/liveActivity";
import type { CatalogLiveStats } from "@/lib/liveActivity";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, itemListSchema, breadcrumbSchema } from "@/components/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "Games — Free and Affordable Catalog Worth Playing",
  description:
    "Browse PlayBound's deliberately small catalog of exceptional free and affordable games. Every title is tested, played, and clears four published criteria.",
  path: "/discover",
});

/**
 * On a warm cache (the vast majority of hits) the live stats resolve in under
 * 1ms.  On a cold miss the multiplayer fan-out can stall for 8.5s+, which
 * blocks the entire page render.  This races the stats against a 3-second
 * budget so the game grid always appears quickly — playing-now badges simply
 * fill in as empty when the stats are still loading.
 */
const LIVE_STATS_BUDGET_MS = 3_000;

function liveStatsWithBudget(): Promise<CatalogLiveStats | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), LIVE_STATS_BUDGET_MS);
    getCatalogLiveStats().then(
      (stats) => {
        clearTimeout(timer);
        resolve(stats);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

export default async function DiscoverPage() {
  const includeTesting = await viewerCanSeeTesting();
  const [games, liveStats] = await Promise.all([
    listGames({ includeTesting }),
    liveStatsWithBudget(),
  ]);

  return (
    <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      {/*
        The catalog as a list entity, built from the same array the page
        renders — so what a crawler is told and what a visitor sees cannot
        drift apart as the catalog changes.
      */}
      <JsonLd
        data={graph(
          itemListSchema(
            "PlayBound Games",
            "Free and affordable games that clear PlayBound's four published criteria.",
            "/discover",
            games
          ),
          breadcrumbSchema([{ name: "Games", path: "/discover" }])
        )}
      />
      {/* Header — matches app's section-header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Games</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Free or regularly $15 or less. Every game is fun today, tested by PlayBound,
            and has That One Thing worth telling a friend about.
          </p>
        </div>
      </div>

      {/* Client-side filters + grid */}
      <DiscoverFilters
        games={games}
        playingNowBySlug={liveStats ? playingNowBySlug(liveStats) : {}}
      />

      {/* SEO fallback: ensure crawlers see links to all games even without JS */}
      <noscript>
        <ul style={{ display: "none" }}>
          {games.map((game) => (
            <li key={game.slug}>
              <a href={`/games/${game.slug}`}>{game.title}</a>
            </li>
          ))}
        </ul>
      </noscript>
    </div>
  );
}

