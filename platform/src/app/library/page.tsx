import Link from "next/link";
import type { Metadata } from "next";
import { Clock, Cloud, Download, Heart, MonitorPlay, Trophy, Users } from "lucide-react";
import { collections, friendsPlaying, getGame, library } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { PlayCta } from "@/components/GameCard";
import { Badge, SectionHeader, StatTile } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Library" };

const categories = [
  { key: "all", label: "All" },
  { key: "installed", label: "Installed" },
  { key: "browser", label: "Browser Games" },
  { key: "favorites", label: "Favorites" },
  { key: "recent", label: "Recently Played" },
  { key: "completed", label: "Completed" },
] as const;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view = "all" } = await searchParams;

  const entries = library
    .map((entry) => ({ entry, game: getGame(entry.gameSlug)! }))
    .filter((x) => x.game)
    .filter(({ entry, game }) => {
      switch (view) {
        case "installed":
          return entry.installed;
        case "browser":
          return game.browserPlayable;
        case "favorites":
          return entry.favorite;
        case "completed":
          return entry.completed;
        case "recent":
        case "all":
        default:
          return true;
      }
    });

  const totalHours = library.reduce((s, e) => s + e.hoursPlayed, 0);
  const totalAchievements = library.reduce((s, e) => s + e.achievementsEarned, 0);
  const updatesAvailable = library.filter((e) => e.updateAvailable).length;

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Your Library</h1>
        <p className="mt-1 text-muted-foreground">
          {library.length} games · cloud saves synced · {updatesAvailable} update
          {updatesAvailable === 1 ? "" : "s"} available
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Hours Played" value={`${totalHours}h`} hint="across your library" />
        <StatTile label="Achievements" value={String(totalAchievements)} hint="earned so far" />
        <StatTile label="Cloud Saves" value="8 synced" hint="up to date on all devices" />
        <StatTile label="Friends In Game" value={String(friendsPlaying.length)} hint="right now" />
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link
            key={c.key}
            href={c.key === "all" ? "/library" : `/library?view=${c.key}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              view === c.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {entries.map(({ entry, game }) => (
          <div
            key={game.slug}
            className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <Link href={`/games/${game.slug}`} className="shrink-0">
              <GameArt game={game} showTitle={false} iconSize="sm" className="size-16 rounded-lg sm:size-20" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/games/${game.slug}`} className="font-bold hover:underline">
                  {game.title}
                </Link>
                {entry.favorite && <Heart className="size-3.5 fill-rose-400 text-rose-400" />}
                {game.browserPlayable ? (
                  <Badge tone="play">
                    <MonitorPlay className="size-3" /> Browser
                  </Badge>
                ) : entry.installed ? (
                  <Badge tone="neutral">Installed</Badge>
                ) : (
                  <Badge tone="outline">Not installed</Badge>
                )}
                {entry.completed && <Badge tone="brand">Completed</Badge>}
                {entry.updateAvailable && (
                  <Badge tone="warn">
                    <Download className="size-3" /> Update
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> {entry.lastPlayed}
                </span>
                <span>{entry.hoursPlayed}h played</span>
                <span className="flex items-center gap-1">
                  <Trophy className="size-3" /> {entry.achievementsEarned}/{game.achievementsCount}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3" />{" "}
                  {friendsPlaying.filter((p) => p.currentGameSlug === game.slug).length} friends playing
                </span>
                <span className="flex items-center gap-1">
                  <Cloud className="size-3" /> save synced
                </span>
              </div>
            </div>
            <PlayCta game={game} size="sm" />
          </div>
        ))}
      </div>

      <section>
        <SectionHeader
          title="Collections You Follow"
          subtitle="Curated lists you're subscribed to"
          href="/collections"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.slice(0, 3).map((c) => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <p className="font-bold">{c.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {c.gameSlugs.length} games · updated {c.updatedAgo}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
