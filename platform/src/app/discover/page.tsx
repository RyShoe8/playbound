import type { Metadata } from "next";
import { listDiscoverableGames } from "@/lib/access/discover";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { DiscoverFilters } from "@/components/DiscoverFilters";
import { getCatalogLiveStats, playingNowBySlug } from "@/lib/liveActivity";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Games — Free and Affordable Catalog Worth Playing",
  description:
    "Browse PlayBound's deliberately small catalog of exceptional free and affordable games. Every title is tested, played, and clears four published criteria.",
  path: "/discover",
});

export default async function DiscoverPage() {
  const includeTesting = await viewerCanSeeTesting();
  const [games, liveStats] = await Promise.all([
    listDiscoverableGames({ includeTesting }),
    getCatalogLiveStats(),
  ]);

  return (
    <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
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
      <DiscoverFilters games={games} playingNowBySlug={playingNowBySlug(liveStats)} />

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
