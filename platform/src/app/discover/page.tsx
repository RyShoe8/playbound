import Link from "next/link";
import type { Metadata } from "next";
import { games, hiddenGems, newReleases, topRated, trendingGames } from "@/lib/data";
import type { Game } from "@/lib/data/types";
import { CardRow, GameCard } from "@/components/GameCard";
import { SectionHeader } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Discover" };

interface FilterDef {
  key: string;
  label: string;
  match: (g: Game) => boolean;
  blurb: string;
}

const filters: FilterDef[] = [
  { key: "trending", label: "Trending", match: (g) => g.weeklyGrowth >= 10, blurb: "The fastest-growing games this week." },
  { key: "new", label: "New Releases", match: (g) => g.isNewRelease, blurb: "Recently published on PlayBound." },
  { key: "top", label: "Top Rated", match: (g) => g.rating >= 4.5, blurb: "The highest-rated games on the platform." },
  { key: "hidden", label: "Hidden Gems", match: (g) => g.hiddenGem, blurb: "Criminally underplayed. Get in early." },
  { key: "browser", label: "Browser Play", match: (g) => g.browserPlayable, blurb: "Click Play and you're in — no install." },
  { key: "multiplayer", label: "Multiplayer", match: (g) => g.activeServers > 0 || g.features.some((f) => f.includes("Multiplayer")), blurb: "Live servers and players waiting." },
  { key: "coop", label: "Co-op", match: (g) => g.features.some((f) => f.toLowerCase().includes("co-op")) || g.tags.some((t) => t.toLowerCase().includes("co-op")), blurb: "Better together." },
  { key: "lan", label: "LAN Games", match: (g) => g.features.some((f) => f.includes("LAN")), blurb: "Born for a room full of friends." },
  { key: "strategy", label: "Strategy", match: (g) => g.genres.includes("Strategy") || g.genres.includes("RTS"), blurb: "Out-think, out-build, out-play." },
  { key: "fps", label: "FPS", match: (g) => g.genres.includes("FPS"), blurb: "Aim true." },
  { key: "racing", label: "Racing", match: (g) => g.genres.includes("Racing"), blurb: "First to the flag." },
  { key: "puzzle", label: "Puzzle", match: (g) => g.genres.includes("Puzzle"), blurb: "Brains over brawn." },
  { key: "rpg", label: "RPG & Roguelike", match: (g) => g.genres.includes("RPG") || g.genres.includes("Roguelike"), blurb: "Level up, loot, repeat." },
  { key: "sim", label: "Simulation & Sandbox", match: (g) => g.genres.includes("Simulation") || g.genres.includes("Sandbox"), blurb: "Build your own fun." },
  { key: "retro", label: "Retro", match: (g) => g.releaseYear <= 2007, blurb: "Classics that refuse to die — for good reason." },
  { key: "family", label: "Family Friendly", match: (g) => g.features.includes("Family Friendly"), blurb: "Fun for every age on the couch." },
  { key: "controller", label: "Controller Support", match: (g) => g.features.some((f) => f.includes("Controller")) || g.steamDeck, blurb: "Lean back and play." },
  { key: "deck", label: "Steam Deck", match: (g) => g.steamDeck, blurb: "Verified great on the go." },
  { key: "servers", label: "Dedicated Servers", match: (g) => g.launchMethods.includes("server"), blurb: "Host it yourself with one click." },
];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const active = filters.find((f) => f.key === filter);

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Discover</h1>
        <p className="mt-1 text-muted-foreground">
          {games.length} free games. Zero checkout pages. Find your next favorite.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/discover"
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
            !active
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
          )}
        >
          All
        </Link>
        {filters.map((f) => (
          <Link
            key={f.key}
            href={`/discover?filter=${f.key}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              active?.key === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {active ? (
        <section>
          <SectionHeader title={active.label} subtitle={active.blurb} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {games.filter(active.match).map((g) => (
              <GameCard key={g.slug} game={g} className="w-full sm:w-full" showGrowth={active.key === "trending"} />
            ))}
          </div>
        </section>
      ) : (
        <>
          <section>
            <SectionHeader title="Trending" subtitle="Gaining players fast" href="/discover?filter=trending" />
            <CardRow>
              {trendingGames.slice(0, 8).map((g) => (
                <GameCard key={g.slug} game={g} showGrowth />
              ))}
            </CardRow>
          </section>
          <section>
            <SectionHeader title="Top Rated" subtitle="The community's highest scores" href="/discover?filter=top" />
            <CardRow>
              {topRated.slice(0, 8).map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </CardRow>
          </section>
          <section>
            <SectionHeader title="Play in Your Browser" subtitle="Instant launch, zero install" href="/discover?filter=browser" />
            <CardRow>
              {games.filter((g) => g.browserPlayable).map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </CardRow>
          </section>
          <section>
            <SectionHeader title="Strategy & RTS" subtitle="Out-think, out-build, out-play" href="/discover?filter=strategy" />
            <CardRow>
              {games.filter((g) => g.genres.includes("Strategy") || g.genres.includes("RTS")).map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </CardRow>
          </section>
          <section>
            <SectionHeader title="Hidden Gems" subtitle="Underplayed and outstanding" href="/discover?filter=hidden" />
            <CardRow>
              {hiddenGems.map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </CardRow>
          </section>
          <section>
            <SectionHeader title="New Releases" subtitle="Fresh on the platform" href="/discover?filter=new" />
            <CardRow>
              {newReleases.map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </CardRow>
          </section>
          <section>
            <SectionHeader title="LAN Party Ready" subtitle="Grab your friends and a switch" href="/discover?filter=lan" />
            <CardRow>
              {games.filter((g) => g.features.some((f) => f.includes("LAN"))).map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </CardRow>
          </section>
        </>
      )}
    </div>
  );
}
