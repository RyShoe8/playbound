import Link from "next/link";
import type { Metadata } from "next";
import { MonitorPlay } from "lucide-react";
import { collections } from "@/lib/data";
import { gamesFor, listGames, hiddenGems } from "@/lib/catalog";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { GameCard } from "@/components/GameCard";
import { Badge, EmptyHint, SectionHeader } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Discover Free Games Worth Playing",
  description:
    "Browse every game in the PlayBound catalog. A deliberately small list — each title clears five published criteria for whether a free game is actually good.",
  path: "/discover",
});

interface FilterDef {
  key: string;
  label: string;
  match: (g: Game) => boolean;
  blurb: string;
}

const filters: FilterDef[] = [
  { key: "hidden", label: "Hidden Gems", match: (g) => g.hiddenGem, blurb: "Editor picks — criminally underplayed." },
  { key: "browser", label: "Browser Play", match: (g) => g.browserPlayable, blurb: "Click Play and you're in — no install." },
  { key: "coop", label: "Co-op", match: (g) => g.features.some((f) => f.toLowerCase().includes("co-op")) || g.tags.some((t) => t.toLowerCase().includes("co-op")), blurb: "Better together." },
  { key: "lan", label: "LAN Games", match: (g) => g.features.some((f) => f.includes("LAN")), blurb: "Born for a room full of friends." },
  { key: "strategy", label: "Strategy", match: (g) => g.genres.includes("Strategy") || g.genres.includes("RTS"), blurb: "Out-think, out-build, out-play." },
  { key: "fps", label: "FPS", match: (g) => g.genres.includes("FPS"), blurb: "Aim true." },
  { key: "racing", label: "Racing", match: (g) => g.genres.includes("Racing"), blurb: "First to the flag." },
  { key: "rpg", label: "RPG & Roguelike", match: (g) => g.genres.includes("RPG") || g.genres.includes("Roguelike"), blurb: "Level up, loot, repeat." },
  { key: "sim", label: "Simulation & Sandbox", match: (g) => g.genres.includes("Simulation") || g.genres.includes("Sandbox"), blurb: "Build your own fun." },
  { key: "retro", label: "Retro", match: (g) => g.releaseYear <= 2007, blurb: "Classics that refuse to die — for good reason." },
  { key: "family", label: "Family Friendly", match: (g) => g.features.includes("Family Friendly"), blurb: "Fun for every age on the couch." },
  { key: "deck", label: "Steam Deck", match: (g) => g.steamDeck, blurb: "Verified great on the go." },
  { key: "servers", label: "Dedicated Servers", match: (g) => g.launchMethods.includes("server"), blurb: "Host it yourself with one click." },
  { key: "small", label: "Under 500MB", match: (g) => g.sizeMB < 500, blurb: "Big fun, small footprint." },
];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const active = filters.find((f) => f.key === filter);
  const [games, gems, collectionPreviews] = await Promise.all([
    listGames(),
    hiddenGems(),
    Promise.all(
      collections.map(async (c) => ({
        collection: c,
        preview: (await gamesFor(c.gameSlugs)).slice(0, 4),
      }))
    ),
  ]);

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Discover</h1>
        <p className="mt-1 text-muted-foreground">
          {games.length} free games. Zero checkout pages. Find your next favorite.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/discover"
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
            !active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
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

      {!active && (
        <section id="collections">
          <SectionHeader title="Collections" subtitle="Curated groupings of free games, hand-picked by PlayBound" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {collectionPreviews.map(({ collection: c, preview }) => (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40"
              >
                <div className="grid grid-cols-4 gap-px">
                  {preview.map((g) => (
                    <GameArt key={g.slug} game={g} showTitle={false} iconSize="sm" className="aspect-square" />
                  ))}
                </div>
                <div className="p-4">
                  <Badge tone="brand">PlayBound Curated</Badge>
                  <p className="mt-2 font-bold">{c.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  <p className="mt-3 text-xs text-muted-foreground">{c.gameSlugs.length} games</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {active ? (
        <section>
          <SectionHeader title={active.label} subtitle={active.blurb} />
          {games.filter(active.match).length === 0 ? (
            <EmptyHint icon={MonitorPlay}>
              {active.key === "browser"
                ? "No browser-playable games yet — every PlayBound game today installs directly from its developer. Check back as browser-native titles launch."
                : "Nothing matches this filter yet."}
            </EmptyHint>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {games.filter(active.match).map((g) => (
                <GameCard key={g.slug} game={g} className="w-full sm:w-full" />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section>
            <SectionHeader title="Hidden Gems" subtitle="Underplayed and outstanding" href="/discover?filter=hidden" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {gems.map((g) => (
                <GameCard key={g.slug} game={g} className="w-full sm:w-full" />
              ))}
            </div>
          </section>
          <section>
            <SectionHeader title="All Games" subtitle="The complete free catalog" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {games.map((g) => (
                <GameCard key={g.slug} game={g} className="w-full sm:w-full" />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
