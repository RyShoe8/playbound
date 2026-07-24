import Link from "next/link";
import type { Metadata } from "next";
import {
  Bell,
  BookOpen,
  CalendarDays,
  MessagesSquare,
  Settings,
  Star,
  Trophy,
  UserPlus,
  Wrench,
} from "lucide-react";
import { activity, currentUser, getGame, library, players } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { Avatar, Badge, SectionHeader, StatTile } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Profile" };

const notifications = [
  { icon: Trophy, text: "You earned “Ore Baron” in OpenRA (+150 XP)", time: "2h ago" },
  { icon: Bell, text: "Veloren released an update — your install will auto-update tonight", time: "5h ago" },
  { icon: UserPlus, text: "aiko404 accepted your friend request", time: "yesterday" },
  { icon: CalendarDays, text: "Reminder: Xonotic Arena Cup #12 starts today at 8:00 PM", time: "today" },
  { icon: MessagesSquare, text: "d4nte replied to your thread in Beyond All Reason", time: "yesterday" },
  { icon: Wrench, text: "Combined Arms (OpenRA mod) updated to v3.2", time: "2 days ago" },
];

export default function ProfilePage() {
  const favorites = library.filter((e) => e.favorite).map((e) => getGame(e.gameSlug)!);
  const xpPct = Math.round((currentUser.xp / currentUser.xpToNext) * 100);
  const myActivity = activity.filter((a) => a.playerHandle && ["MarcusN", "d4nte"].includes(a.playerHandle));

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      {/* Banner */}
      <section className="overflow-hidden rounded-2xl border border-border">
        <div
          className="h-36 sm:h-44"
          style={{
            background: `linear-gradient(120deg, oklch(0.4 0.16 ${currentUser.avatarHue}), oklch(0.3 0.12 ${currentUser.avatarHue + 60}), oklch(0.22 0.06 ${currentUser.avatarHue + 120}))`,
          }}
        />
        <div className="bg-card px-6 pb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="-mt-10">
              <Avatar name={currentUser.name} hue={currentUser.avatarHue} size="xl" status="Online" className="rounded-full ring-4 ring-card" />
            </div>
            <div className="min-w-0 flex-1 pt-4">
              <h1 className="text-2xl font-extrabold tracking-tight">{currentUser.name}</h1>
              <p className="text-sm text-muted-foreground">
                @{currentUser.handle} · {currentUser.followers} followers · {currentUser.following} following
              </p>
            </div>
            <div className="flex gap-2 pt-4">
              <button className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary/70">
                <Settings className="size-4" /> Edit Profile
              </button>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{currentUser.bio}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {currentUser.favoriteGenres.map((g) => (
              <Badge key={g} tone="brand">{g}</Badge>
            ))}
          </div>
          {/* Level progress */}
          <div className="mt-5 max-w-md">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>Level {currentUser.level}</span>
              <span className="text-muted-foreground">
                {Intl.NumberFormat("en").format(currentUser.xp)} / {Intl.NumberFormat("en").format(currentUser.xpToNext)} XP
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section>
        <SectionHeader title="Statistics" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Hours Played" value={`${currentUser.stats.hoursPlayed}h`} />
          <StatTile label="Games Played" value={String(currentUser.stats.gamesPlayed)} />
          <StatTile label="Achievements" value={String(currentUser.stats.achievements)} />
          <StatTile label="Servers Hosted" value={String(currentUser.stats.serversHosted)} />
          <StatTile label="Longest Session" value={currentUser.stats.longestSession} hint="OpenRA, obviously" />
          <StatTile label="Current Streak" value={`${currentUser.stats.currentStreak} days`} hint="keep it going" />
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          {/* Favorite games */}
          <section>
            <SectionHeader title="Favorite Games" href="/library?view=favorites" />
            <div className="grid gap-3 sm:grid-cols-3">
              {favorites.map((g) => (
                <Link key={g.slug} href={`/games/${g.slug}`} className="group">
                  <GameArt game={g} className="aspect-video rounded-xl border border-border transition-all group-hover:border-primary/40" iconSize="md" />
                </Link>
              ))}
            </div>
          </section>

          {/* Recent achievements */}
          <section>
            <SectionHeader title="Recent Achievements" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { name: "Ore Baron", game: "OpenRA", xp: 150, when: "2h ago" },
                { name: "Chain Reaction", game: "Capsule Clash", xp: 250, when: "yesterday" },
                { name: "Wave Goodbye", game: "Mindustry", xp: 350, when: "3 days ago" },
                { name: "First Blood", game: "OpenRA", xp: 50, when: "1 week ago" },
              ].map((a) => (
                <div key={a.name} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-400/15">
                    <Trophy className="size-5 text-amber-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.game} · {a.when}</p>
                  </div>
                  <span className="text-xs font-bold text-amber-400">+{a.xp} XP</span>
                </div>
              ))}
            </div>
          </section>

          {/* Notifications */}
          <section id="notifications">
            <SectionHeader title="Notifications" subtitle="Game updates, friends, achievements, events, and more" />
            <div className="overflow-hidden rounded-xl border border-border">
              {notifications.map((n, i) => (
                <div key={n.text} className={`flex items-center gap-3 bg-card px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <n.icon className="size-4 text-primary" />
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm">{n.text}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{n.time}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar: friends + contributions */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Friends ({players.filter((p) => p.isFriend).length})</p>
              <button className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <UserPlus className="size-3.5" /> Add
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {players.filter((p) => p.isFriend).slice(0, 6).map((p) => (
                <div key={p.handle} className="flex items-center gap-3">
                  <Avatar name={p.name} hue={p.avatarHue} size="sm" status={p.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.handle}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.currentGameSlug ? getGame(p.currentGameSlug)?.title : p.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-bold">Contributions</p>
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground">
                <Star className="size-4 text-amber-400" /> 6 reviews written
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="size-4 text-primary" /> 2 guides published
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <MessagesSquare className="size-4 text-fuchsia-400" /> 41 forum posts
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-bold">Recent Activity</p>
            <div className="mt-3 space-y-2.5">
              {myActivity.slice(0, 4).map((a) => (
                <p key={a.text} className="text-xs text-muted-foreground">
                  {a.text} <span className="opacity-60">· {a.timeAgo} ago</span>
                </p>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
