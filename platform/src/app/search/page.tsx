import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { FolderHeart, Hammer, Search, SlidersHorizontal } from "lucide-react";
import { searchAll, searchGames, type GameFilter } from "@/lib/catalog";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { getCatalogLiveStats, playingNowBySlug } from "@/lib/liveActivity";
import { SearchGameResults } from "@/components/SearchGameResults";
import { SearchEditionResults } from "@/components/SearchEditionResults";
import { SearchFilters } from "@/components/SearchFilters";
import { Avatar, EmptyHint, SectionHeader } from "@/components/ui/bits";

export const metadata: Metadata = {
  title: "Search",
  // Search result pages are thin and infinite — never index them.
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    genre?: string | string[];
    tag?: string | string[];
    platform?: string | string[];
    feature?: string | string[];
    sort?: string;
    sortDir?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";

  const toArray = (v: string | string[] | undefined): string[] => {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  };

  const genres = toArray(params.genre);
  const tags = toArray(params.tag);
  const platforms = toArray(params.platform);
  const features = toArray(params.feature);
  const sort = (params.sort ?? "title") as GameFilter["sort"];
  const sortDir = (params.sortDir ?? "asc") as GameFilter["sortDir"];

  const hasFilters = genres.length > 0 || tags.length > 0 || platforms.length > 0 || features.length > 0;
  const hasSearch = !!q;
  const hasAny = hasSearch || hasFilters;
  const includeTesting = await viewerCanSeeTesting();

  // Run structured game filter
  const filter: GameFilter = {
    q: q || undefined,
    genres: genres.length ? genres : undefined,
    tags: tags.length ? tags : undefined,
    platforms: platforms.length ? platforms : undefined,
    features: features.length ? features : undefined,
    sort,
    sortDir,
  };

  /*
   * Both start together; sort=players is the only path that has to await the
   * stats before searching, so every other sort keeps the parallel fetch.
   */
  const liveStatsPromise = getCatalogLiveStats();
  const games = hasAny
    ? await searchGames(filter, {
        includeTesting,
        playingNow: sort === "players" ? playingNowBySlug(await liveStatsPromise) : undefined,
      })
    : ([] as Awaited<ReturnType<typeof searchGames>>);
  const liveStats = await liveStatsPromise;

  // Also search developers and collections when there's a text query
  const otherResults = hasSearch ? await searchAll(q, { includeTesting }) : null;
  const developerResults = otherResults?.developers ?? [];
  const collectionResults = otherResults?.collections ?? [];
  // Editions match on their own name, so "Turtle" finds Turtle WoW even though
  // its game is called World of Warcraft and would not match the query itself.
  const editionResults = otherResults?.editions ?? [];

  const total =
    games.length + developerResults.length + collectionResults.length + editionResults.length;

  return (
    <div className="space-y-4 px-4 pt-2 pb-6 sm:px-6 lg:px-8">
      <Suspense fallback={null}>
        <SearchFilters query={q} resultCount={hasAny ? total : null} />
      </Suspense>

      {!hasAny && (
        <EmptyHint icon={Search}>Try searching for &ldquo;RTS&rdquo;, &ldquo;space&rdquo;, a game title, or use the filters above.</EmptyHint>
      )}

      {hasAny && total === 0 && (
        <EmptyHint icon={SlidersHorizontal}>
          Nothing matched your search. Try fewer filters, a different query, or browse{" "}
          <Link href="/discover" className="font-semibold text-primary hover:underline">
            Discover
          </Link>
          .
        </EmptyHint>
      )}

      {games.length > 0 && (
        <SearchGameResults games={games} playingNowBySlug={playingNowBySlug(liveStats)} />
      )}

      {editionResults.length > 0 && <SearchEditionResults hits={editionResults} />}

      {developerResults.length > 0 && (
        <section>
          <SectionHeader title={`Developers (${developerResults.length})`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {developerResults.map((d) => (
              <Link
                key={d.slug}
                href={`/developers/${d.slug}`}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <Avatar name={d.name} hue={d.artHue} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-bold">
                    <Hammer className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">{d.name}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{d.tagline}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {collectionResults.length > 0 && (
        <section>
          <SectionHeader title={`Collections (${collectionResults.length})`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {collectionResults.map((c) => (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <p className="flex items-center gap-1.5 font-bold">
                  <FolderHeart className="size-3.5 text-primary" /> {c.title}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
