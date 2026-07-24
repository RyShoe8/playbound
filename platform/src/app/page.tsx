import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Download,
  Gem,
  MessagesSquare,
  Newspaper,
  Server,
  Sparkles,
  Star,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  activity,
  browserGames,
  collections,
  continuePlaying,
  events,
  friendsPlaying,
  gameOfTheWeek,
  games,
  getGame,
  hiddenGems,
  mods,
  multiplayerNow,
  newReleases,
  reviews,
  trendingGames,
} from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { CardRow, GameCard, PlayCta } from "@/components/GameCard";
import { ActivityTicker } from "@/components/ActivityTicker";
import { NewsletterForm } from "@/components/NewsletterForm";
import { Avatar, Badge, PlayersOnline, Rating, SectionHeader } from "@/components/ui/bits";

export default function HomePage() {
  const hero = gameOfTheWeek;
  const recommended = games.filter(
    (g) =>
      g.genres.some((genre) => ["RTS", "Puzzle", "Simulation"].includes(genre)) && !g.gameOfWeek
  );
  const spotlightMod = mods[0];
  const spotlightCollection = collections.find((c) => c.curatorType === "community")!;
  const spotlightReview = reviews[2];
  const gem = hiddenGems[0];
  const nextEvent = events[0];

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
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {hero.title}
          </h1>
          <p className="max-w-xl text-sm text-white/85 sm:text-base">{hero.tagline}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
            <Rating value={hero.rating} count={hero.ratingCount} className="text-white" />
            <span>·</span>
            <span>{hero.genres.join(" / ")}</span>
            <span>·</span>
            <PlayersOnline count={hero.playersOnline} className="text-white/80" />
          </div>
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

      <ActivityTicker items={activity} />

      {/* ── Continue Playing ───────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Continue Playing"
          subtitle="Pick up right where you left off"
          href="/library"
          linkLabel="Your library"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {continuePlaying.map(({ entry, game }) => (
            <div
              key={game.slug}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <Link href={`/games/${game.slug}`} className="shrink-0">
                <GameArt game={game} showTitle={false} iconSize="sm" className="size-16 rounded-lg" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/games/${game.slug}`} className="block truncate font-bold hover:underline">
                  {game.title}
                </Link>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3" /> {entry.lastPlayed} · {entry.hoursPlayed}h played
                </p>
                {entry.updateAvailable && (
                  <Badge tone="warn" className="mt-1.5">
                    <Download className="size-3" /> Update available
                  </Badge>
                )}
              </div>
              <PlayCta game={game} size="sm" />
            </div>
          ))}
        </div>
      </section>

      {/* ── Recommended For You ────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Recommended For You"
          subtitle="Because you play RTS, puzzle, and simulation games"
          href="/discover"
        />
        <CardRow>
          {recommended.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </CardRow>
      </section>

      {/* ── Trending ───────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Trending Games"
          subtitle="The fastest-growing games on PlayBound this week"
          href="/discover?filter=trending"
        />
        <CardRow>
          {trendingGames.slice(0, 8).map((g) => (
            <GameCard key={g.slug} game={g} showGrowth />
          ))}
        </CardRow>
      </section>

      {/* ── Browser Games ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-transparent to-transparent p-5 sm:p-6">
        <SectionHeader
          title="Play Instantly in Your Browser"
          subtitle="No install. No launcher. Click and you're in."
          href="/discover?filter=browser"
        />
        <CardRow>
          {browserGames.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </CardRow>
      </section>

      {/* ── Multiplayer Now ────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Multiplayer Now"
          subtitle="Live servers with players waiting"
          href="/discover?filter=multiplayer"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {multiplayerNow.slice(0, 6).map((g) => (
            <Link
              key={g.slug}
              href={`/games/${g.slug}?tab=servers`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <GameArt game={g} showTitle={false} iconSize="sm" className="size-14 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{g.title}</p>
                <PlayersOnline count={g.playersOnline} className="text-xs" />
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Server className="size-3.5" />
                {g.activeServers} servers
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Friends Activity ───────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Friends Activity"
          subtitle="See what your friends are playing right now"
          href="/community"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {friendsPlaying.map((p) => {
            const game = p.currentGameSlug ? getGame(p.currentGameSlug) : undefined;
            return (
              <div key={p.handle} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} hue={p.avatarHue} status={p.status} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.handle}</p>
                    <p className="text-xs text-muted-foreground">{p.status}</p>
                  </div>
                </div>
                {game && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Link
                      href={`/games/${game.slug}`}
                      className="truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {game.title}
                    </Link>
                    <Link
                      href={`/games/${game.slug}?tab=servers`}
                      className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-bold transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      Join
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── New Releases & Hidden Gems ─────────────────────────── */}
      <section>
        <SectionHeader
          title="New & Noteworthy"
          subtitle="Fresh releases and hidden gems worth your weekend"
          href="/discover?filter=new"
        />
        <CardRow>
          {[...newReleases, ...hiddenGems].map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </CardRow>
      </section>

      {/* ── Community Spotlight ────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Community Spotlight"
          subtitle="The best of what players made this week"
          href="/community"
        />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <Badge tone="brand">
              <Wrench className="size-3" /> Featured Mod
            </Badge>
            <p className="mt-3 font-bold">{spotlightMod.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{spotlightMod.summary}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              for{" "}
              <Link href={`/games/${spotlightMod.gameSlug}`} className="text-foreground hover:underline">
                {getGame(spotlightMod.gameSlug)?.title}
              </Link>{" "}
              · {Intl.NumberFormat("en").format(spotlightMod.downloads)} downloads
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <Badge tone="brand">
              <Gem className="size-3" /> Trending Collection
            </Badge>
            <Link href={`/collections/${spotlightCollection.slug}`} className="mt-3 block font-bold hover:underline">
              {spotlightCollection.title}
            </Link>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {spotlightCollection.description}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              by {spotlightCollection.curator} ·{" "}
              {Intl.NumberFormat("en").format(spotlightCollection.followers)} followers
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <Badge tone="brand">
              <Star className="size-3" /> Review of the Week
            </Badge>
            <p className="mt-3 font-bold">“{spotlightReview.title}”</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{spotlightReview.body}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {spotlightReview.author} on{" "}
              <Link href={`/games/${spotlightReview.gameSlug}`} className="text-foreground hover:underline">
                {getGame(spotlightReview.gameSlug)?.title}
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Weekly Newsletter ──────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-card to-card">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Badge tone="brand">
              <Newspaper className="size-3" /> The PlayBound Weekly
            </Badge>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight">
              Something new to play, every single week.
            </h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Game of the Week, a hidden gem, community spotlights, free promo games, and upcoming
              events — one email every Friday. The heartbeat of the platform, in your inbox.
            </p>
            <div className="mt-5">
              <NewsletterForm />
            </div>
          </div>
          <div className="space-y-2.5 text-sm">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              This week&apos;s issue
            </p>
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-4 shrink-0 text-play" />
              <span>
                <span className="font-semibold">Game of the Week:</span> {hero.title}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Gem className="size-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold">Hidden Gem:</span> {gem.title} — {gem.tagline}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <MessagesSquare className="size-4 shrink-0 text-fuchsia-400" />
              <span>
                <span className="font-semibold">Community Spotlight:</span> {spotlightMod.name} hits{" "}
                {Intl.NumberFormat("en").format(spotlightMod.downloads)} downloads
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <TrendingUp className="size-4 shrink-0 text-amber-400" />
              <span>
                <span className="font-semibold">Rising fast:</span> {trendingGames[0].title} (+
                {trendingGames[0].weeklyGrowth}% players)
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <CalendarDays className="size-4 shrink-0 text-sky-400" />
              <span>
                <span className="font-semibold">Up next:</span> {nextEvent.title}, {nextEvent.when}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
