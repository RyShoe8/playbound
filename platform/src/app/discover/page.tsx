import type { Metadata } from "next";
import { listGames } from "@/lib/catalog";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { DiscoverFilters } from "@/components/DiscoverFilters";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Games — Free Catalog Worth Playing",
  description:
    "Browse every game in the PlayBound catalog. A deliberately small list — each title clears five published criteria for whether a free game is actually good.",
  path: "/discover",
});

export default async function DiscoverPage() {
  const includeTesting = await viewerCanSeeTesting();
  const games = await listGames({ includeTesting });

  return (
    <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header — matches app's section-header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Games</h1>
          <p className="mt-1 text-muted-foreground">
            Browse free PC games you can install with PlayBound.
          </p>
        </div>
      </div>

      {/* Client-side filters + grid */}
      <DiscoverFilters games={games} />

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
