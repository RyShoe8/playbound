import Link from "next/link";
import type { Metadata } from "next";
import { Bell, CalendarDays, Users } from "lucide-react";
import { events, getGame } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { Badge } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Events" };

const typeTone: Record<string, "brand" | "play" | "warn" | "neutral"> = {
  Tournament: "warn",
  "Community Night": "play",
  "Dev Livestream": "brand",
  Speedrun: "brand",
  "LAN Weekend": "play",
  "Seasonal Challenge": "neutral",
};

export default function EventsPage() {
  const [next, ...rest] = events;
  const nextGame = getGame(next.gameSlug)!;

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Events</h1>
        <p className="mt-1 text-muted-foreground">
          Tournaments, community nights, livestreams, and seasonal challenges. Register and we&apos;ll
          remind you before it starts.
        </p>
      </div>

      {/* Next up */}
      <section className="relative overflow-hidden rounded-2xl border border-border">
        <GameArt game={nextGame} showTitle={false} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
        <div className="relative flex min-h-[260px] flex-col justify-end gap-3 p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <Badge tone={typeTone[next.type]}>{next.type}</Badge>
            <Badge tone="play">Starting {next.startsIn}</Badge>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white">{next.title}</h2>
          <p className="max-w-xl text-sm text-white/85">{next.description}</p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" /> {next.when}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4" /> {next.registered} registered
            </span>
            <span>Hosted by {next.host}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <button className="rounded-full bg-play px-6 py-2.5 text-sm font-bold text-play-foreground transition-all hover:brightness-110">
              Register
            </button>
            <Link
              href={`/games/${next.gameSlug}`}
              className="rounded-full border border-white/25 bg-white/10 px-6 py-2.5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              View Game
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rest.map((e) => {
          const game = getGame(e.gameSlug);
          return (
            <div key={e.slug} className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2">
                <Badge tone={typeTone[e.type]}>{e.type}</Badge>
                <span className="text-xs text-muted-foreground">{e.startsIn}</span>
              </div>
              <p className="mt-2.5 font-bold">{e.title}</p>
              <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted-foreground">{e.description}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3" /> {e.when}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3" /> {e.registered}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                {game && (
                  <Link href={`/games/${game.slug}`} className="truncate text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline">
                    {game.title}
                  </Link>
                )}
                <button className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-xs font-bold transition-colors hover:bg-primary hover:text-primary-foreground">
                  <Bell className="size-3" /> Register
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
