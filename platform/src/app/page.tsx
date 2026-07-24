import Link from "next/link";
import { Compass, Gem, Newspaper, Sparkles } from "lucide-react";
import { collections, gameOfTheWeek, games, hiddenGems } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { CardRow, GameCard, PlayCta } from "@/components/GameCard";
import { NewsletterForm } from "@/components/NewsletterForm";
import { Badge, SectionHeader } from "@/components/ui/bits";

export default function HomePage() {
  const hero = gameOfTheWeek;
  const featuredCollections = collections.slice(0, 3);

  return (
    <div className="space-y-12 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Hero: Game of the Week ─────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-border">
        <GameArt game={hero} showTitle={false} className="absolute inset-0" iconSize="lg" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/10" />
        <div className="relative flex min-h-[380px] flex-col justify-end gap-4 p-6 sm:p-10 lg:max-w-2xl">
          <Badge tone="play" className="w-fit">
            <Sparkles className="size-3" /> Game of the Week
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{hero.title}</h1>
          <p className="max-w-xl text-sm text-white/85 sm:text-base">{hero.tagline}</p>
          <p className="text-sm text-white/70">{hero.genres.join(" / ")} · {hero.releaseYear}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <PlayCta game={hero} size="lg" />
            <Link
              href={`/games/${hero.slug}`}
              className="inline-flex h-12 items-center rounded-full border border-white/25 bg-white/10 px-7 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* ── Full catalog ───────────────────────────────────────── */}
      <section>
        <SectionHeader title="All Games" subtitle={`${games.length} free games, no exceptions`} href="/discover" />
        <CardRow>
          {games.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </CardRow>
      </section>

      {/* ── Hidden gems ────────────────────────────────────────── */}
      {hiddenGems.length > 0 && (
        <section>
          <SectionHeader
            title="Hidden Gems"
            subtitle="Editor picks — criminally underplayed, genuinely excellent"
            href="/discover?filter=hidden"
          />
          <CardRow>
            {hiddenGems.map((g) => (
              <GameCard key={g.slug} game={g} />
            ))}
          </CardRow>
        </section>
      )}

      {/* ── Collections ────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Curated Collections" subtitle="Hand-picked groupings from PlayBound" href="/collections" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredCollections.map((c) => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <p className="flex items-center gap-1.5 font-bold">
                <Gem className="size-3.5 text-primary" /> {c.title}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">{c.gameSlugs.length} games</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Discover CTA ───────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-transparent to-transparent p-6 text-center sm:p-8">
        <Compass className="mx-auto size-7 text-primary" />
        <h2 className="mt-3 text-xl font-bold">Browse by genre, platform, and more</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Discover replaces the storefront — every category is curated instead of overwhelming.
        </p>
        <Link
          href="/discover"
          className="mt-4 inline-flex rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          Go to Discover
        </Link>
      </section>

      {/* ── Newsletter ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-card to-card p-6 sm:p-8">
        <Badge tone="brand">
          <Newspaper className="size-3" /> The PlayBound Weekly
        </Badge>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Something new to play, every single week.</h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          One email every Friday with what&apos;s worth playing. No spam, unsubscribe any time.
        </p>
        <div className="mt-5">
          <NewsletterForm />
        </div>
      </section>
    </div>
  );
}
