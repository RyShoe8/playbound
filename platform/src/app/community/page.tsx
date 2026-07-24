import Link from "next/link";
import type { Metadata } from "next";
import {
  Activity,
  BookOpen,
  FolderHeart,
  MessagesSquare,
  Server,
  Star,
  Trophy,
  Users,
  Wrench,
} from "lucide-react";
import { activity, discussions, getGame, guides, players, reviews } from "@/lib/data";
import type { ActivityKind } from "@/lib/data/types";
import { Avatar, Badge, Rating, SectionHeader } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Community" };

const kindIcon: Record<ActivityKind, typeof Activity> = {
  started: Activity,
  achievement: Trophy,
  server: Server,
  collection: FolderHeart,
  review: Star,
  guide: BookOpen,
  milestone: Users,
  tournament: Trophy,
  mod: Wrench,
};

export default function CommunityPage() {
  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Community</h1>
        <p className="mt-1 text-muted-foreground">
          The social hub of PlayBound — everything centered around games and the people playing them.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-10">
          {/* Global activity feed */}
          <section>
            <SectionHeader
              title="Global Activity"
              subtitle="Live from across the platform — the feed never sleeps"
            />
            <div className="overflow-hidden rounded-xl border border-border">
              {activity.map((item, i) => {
                const Icon = kindIcon[item.kind];
                const game = item.gameSlug ? getGame(item.gameSlug) : undefined;
                return (
                  <div
                    key={`${item.text}-${i}`}
                    className={cn("flex items-center gap-3 bg-card px-4 py-3", i > 0 && "border-t border-border")}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <Icon className="size-4 text-primary" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm">
                      {game ? (
                        <Link href={`/games/${game.slug}`} className="hover:underline">
                          {item.text}
                        </Link>
                      ) : (
                        item.text
                      )}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.timeAgo} ago</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Trending guides */}
          <section>
            <SectionHeader title="Trending Guides" subtitle="What the community is reading right now" />
            <div className="grid gap-3 sm:grid-cols-2">
              {guides
                .filter((g) => g.trending)
                .concat(guides.filter((g) => !g.trending).slice(0, 2))
                .map((g) => (
                  <Link
                    key={g.title}
                    href={`/games/${g.gameSlug}?tab=guides`}
                    className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone={g.kind === "Beginner" ? "play" : "brand"}>{g.kind}</Badge>
                      {g.trending && <Badge tone="warn">Trending</Badge>}
                    </div>
                    <p className="mt-2 font-semibold">{g.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {getGame(g.gameSlug)?.title} · by {g.author} ·{" "}
                      {Intl.NumberFormat("en", { notation: "compact" }).format(g.views)} views
                    </p>
                  </Link>
                ))}
            </div>
          </section>

          {/* Hot discussions */}
          <section>
            <SectionHeader title="Hot Discussions" subtitle="Threads with the most action today" />
            <div className="overflow-hidden rounded-xl border border-border">
              {discussions.map((d, i) => (
                <Link
                  key={d.title}
                  href={`/games/${d.gameSlug}?tab=discussion`}
                  className={cn(
                    "flex items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-secondary/40",
                    i > 0 && "border-t border-border"
                  )}
                >
                  <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {getGame(d.gameSlug)?.title} · by {d.author}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p className="font-bold text-foreground">{d.replies}</p>
                    <p>{d.lastActive}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Recent reviews */}
          <section>
            <SectionHeader title="Fresh Reviews" subtitle="Honest takes from real playtime" />
            <div className="grid gap-3 sm:grid-cols-2">
              {reviews.slice(0, 4).map((r) => (
                <Link
                  key={r.title}
                  href={`/games/${r.gameSlug}?tab=reviews`}
                  className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">“{r.title}”</p>
                    <Rating value={r.rating} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {r.author} on {getGame(r.gameSlug)?.title} · {r.timeAgo}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Friends sidebar */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Users className="size-4 text-primary" /> Friends ({players.filter((p) => p.isFriend).length})
            </p>
            <div className="mt-3 space-y-3">
              {players
                .filter((p) => p.isFriend)
                .map((p) => {
                  const game = p.currentGameSlug ? getGame(p.currentGameSlug) : undefined;
                  return (
                    <div key={p.handle} className="flex items-center gap-3">
                      <Avatar name={p.name} hue={p.avatarHue} size="sm" status={p.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.handle}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {game ? `${p.status} · ${game.title}` : p.status}
                        </p>
                      </div>
                      {game && (
                        <Link
                          href={`/games/${game.slug}?tab=servers`}
                          className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          Join
                        </Link>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-bold">Weekly Leaderboard</p>
            <p className="mt-0.5 text-xs text-muted-foreground">XP earned this week</p>
            <div className="mt-3 space-y-2.5">
              {[...players]
                .sort((a, b) => b.level - a.level)
                .slice(0, 5)
                .map((p, i) => (
                  <div key={p.handle} className="flex items-center gap-2.5 text-sm">
                    <span className={cn("w-5 text-center font-extrabold", i === 0 ? "text-amber-400" : "text-muted-foreground")}>
                      {i + 1}
                    </span>
                    <Avatar name={p.name} hue={p.avatarHue} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.handle}</span>
                    <span className="text-xs text-muted-foreground">Lv {p.level}</span>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-gradient-to-br from-primary/15 to-card p-4">
            <p className="text-sm font-bold">Community Challenge</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Platform-wide goal: 10,000 multiplayer matches this week. Progress: 7,214. Everyone gets
              the “Play Together” badge if we make it.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-[72%] rounded-full bg-play" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
