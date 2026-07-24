import Link from "next/link";
import type { Metadata } from "next";
import { FolderHeart, Hammer, Search } from "lucide-react";
import { searchAll } from "@/lib/data";
import { GameCard } from "@/components/GameCard";
import { Avatar, EmptyHint, SectionHeader } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = searchAll(q);
  const total = results.games.length + results.developers.length + results.collections.length;

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Search</h1>
        <p className="mt-1 text-muted-foreground">
          {q
            ? `${total} result${total === 1 ? "" : "s"} for "${q}" across games, developers, and collections`
            : "Search games, developers, and collections from the bar above."}
        </p>
      </div>

      {!q && (
        <EmptyHint icon={Search}>Try searching for &ldquo;RTS&rdquo;, &ldquo;space&rdquo;, or a game title.</EmptyHint>
      )}

      {q && total === 0 && (
        <EmptyHint icon={Search}>
          Nothing matched &ldquo;{q}&rdquo;. Try a genre, a game title, or browse{" "}
          <Link href="/discover" className="font-semibold text-primary hover:underline">
            Discover
          </Link>
          .
        </EmptyHint>
      )}

      {results.games.length > 0 && (
        <section>
          <SectionHeader title={`Games (${results.games.length})`} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {results.games.map((g) => (
              <GameCard key={g.slug} game={g} className="w-full sm:w-full" />
            ))}
          </div>
        </section>
      )}

      {results.developers.length > 0 && (
        <section>
          <SectionHeader title={`Developers (${results.developers.length})`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.developers.map((d) => (
              <Link
                key={d.slug}
                href={`/developers/${d.slug}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <Avatar name={d.name} hue={d.artHue} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-bold">
                    <Hammer className="size-3.5 text-primary" /> {d.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{d.tagline}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.collections.length > 0 && (
        <section>
          <SectionHeader title={`Collections (${results.collections.length})`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.collections.map((c) => (
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
