import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, CalendarDays, FolderHeart, Hammer, Search, Wrench } from "lucide-react";
import { getGame, searchAll } from "@/lib/data";
import { GameCard } from "@/components/GameCard";
import { Avatar, Badge, EmptyHint, SectionHeader } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = searchAll(q);
  const total =
    results.games.length +
    results.developers.length +
    results.collections.length +
    results.players.length +
    results.events.length +
    results.guides.length +
    results.mods.length;

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Search</h1>
        <p className="mt-1 text-muted-foreground">
          {q
            ? `${total} result${total === 1 ? "" : "s"} for "${q}" across games, developers, collections, players, guides, mods, and events`
            : "Search everything on PlayBound from the bar above."}
        </p>
      </div>

      {!q && (
        <EmptyHint icon={Search}>
          Try searching for “RTS”, “browser”, “Xonotic”, or a friend&apos;s handle.
        </EmptyHint>
      )}

      {q && total === 0 && (
        <EmptyHint icon={Search}>
          Nothing matched “{q}”. Try a genre, a game title, or browse{" "}
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

      {results.players.length > 0 && (
        <section>
          <SectionHeader title={`Players (${results.players.length})`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {results.players.map((p) => (
              <div key={p.handle} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <Avatar name={p.name} hue={p.avatarHue} status={p.status} />
                <div className="min-w-0">
                  <p className="truncate font-bold">{p.handle}</p>
                  <p className="text-xs text-muted-foreground">
                    Level {p.level} · {p.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {results.guides.length > 0 && (
        <section>
          <SectionHeader title={`Guides (${results.guides.length})`} />
          <div className="grid gap-3 sm:grid-cols-2">
            {results.guides.map((g) => (
              <Link
                key={g.title}
                href={`/games/${g.gameSlug}?tab=guides`}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <BookOpen className="size-3.5 shrink-0 text-primary" /> {g.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {getGame(g.gameSlug)?.title} · by {g.author}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.mods.length > 0 && (
        <section>
          <SectionHeader title={`Mods (${results.mods.length})`} />
          <div className="grid gap-3 sm:grid-cols-2">
            {results.mods.map((m) => (
              <Link
                key={m.name}
                href={`/games/${m.gameSlug}?tab=mods`}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <Wrench className="size-3.5 text-primary" /> {m.name}
                </p>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{m.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.events.length > 0 && (
        <section>
          <SectionHeader title={`Events (${results.events.length})`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.events.map((e) => (
              <Link
                key={e.slug}
                href="/events"
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <Badge tone="brand">{e.type}</Badge>
                <p className="mt-2 flex items-center gap-1.5 font-bold">
                  <CalendarDays className="size-3.5 text-primary" /> {e.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.when} · {e.registered} registered
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
