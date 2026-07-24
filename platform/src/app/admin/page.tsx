import Link from "next/link";
import type { Metadata } from "next";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Plus,
  RefreshCw,
  Shield,
  Upload,
} from "lucide-react";
import { developers, games, totalPlayersOnline } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { Badge, SectionHeader, StatTile } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin" };

const adminNav = [
  "Dashboard",
  "Games",
  "Developers",
  "Submissions",
  "Collections",
  "Events",
  "News",
  "Guides",
  "Mods",
  "Media",
  "Achievements",
  "Users",
  "Servers",
  "Reviews",
  "Analytics",
  "Automation",
  "Settings",
];

const submissions = [
  { title: "Hypersomnia", dev: "TeamHypersomnia", type: "Install + Servers", submitted: "2 days ago", status: "In review" },
  { title: "Tanks of Freedom II", dev: "P1X", type: "Install", submitted: "4 days ago", status: "In review" },
  { title: "Orbit Golf", dev: "wobblestudio", type: "Browser", submitted: "6 days ago", status: "Changes requested" },
];

const automation = [
  { task: "Version check sweep (all games)", last: "38 min ago", status: "ok" },
  { task: "Image optimization queue", last: "1 h ago", status: "ok" },
  { task: "Search index refresh", last: "2 h ago", status: "ok" },
  { task: "Broken download detector", last: "3 h ago", status: "warn", note: "1 mirror flagged: Warzone 2100 (EU)" },
  { task: "Recommendation model refresh", last: "6 h ago", status: "ok" },
  { task: "Scheduled news publisher", last: "today 6:00 AM", status: "ok" },
];

export default function AdminPage() {
  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Shield className="size-7 text-primary" /> Administration
          </h1>
          <p className="mt-1 text-muted-foreground">
            The PlayBound CMS — every game, first-party or submitted, managed through one workflow.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110">
          <Plus className="size-4" /> Add Game
        </button>
      </div>

      {/* Admin nav (visual) */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {adminNav.map((item, i) => (
          <span
            key={item}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold",
              i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}
          >
            {item}
          </span>
        ))}
      </div>

      {/* Platform health */}
      <section>
        <SectionHeader title="Platform Health" subtitle="Live overview, refreshed every minute" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Total Games" value={String(games.length)} hint={`${games.filter((g) => g.firstParty).length} first-party`} />
          <StatTile label="Developers" value={String(developers.length)} hint="published profiles" />
          <StatTile label="Daily Active Users" value="48.2K" hint="+6% vs last week" />
          <StatTile label="Browser Launches" value="12.4K" hint="today" />
          <StatTile label="Native Installs" value="3.1K" hint="today" />
          <StatTile label="Multiplayer Sessions" value={Intl.NumberFormat("en").format(totalPlayersOnline)} hint="players in game now" />
          <StatTile label="Newsletter Subs" value="21.7K" hint="+312 this week" />
          <StatTile label="Pending Submissions" value={String(submissions.length)} hint="oldest: 6 days" />
          <StatTile label="Moderation Queue" value="4" hint="2 reviews, 2 screenshots" />
          <StatTile label="Storage" value="1.8 TB" hint="of 4 TB budget" />
          <StatTile label="Launch Success" value="99.2%" hint="last 24h" />
          <StatTile label="Trending" value={games.filter((g) => g.weeklyGrowth >= 10).length + " games"} hint="≥10% weekly growth" />
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
        {/* Games management table */}
        <section className="min-w-0">
          <SectionHeader title="Games" subtitle="Adding a game should feel like publishing a blog post" />
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-semibold">Game</th>
                  <th className="px-4 py-3 font-semibold">Launch</th>
                  <th className="px-4 py-3 font-semibold">Players</th>
                  <th className="px-4 py-3 font-semibold">Growth</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {games.slice(0, 10).map((g) => (
                  <tr key={g.slug} className="border-b border-border bg-card last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/games/${g.slug}`} className="flex items-center gap-2.5 hover:underline">
                        <GameArt game={g} showTitle={false} iconSize="sm" className="size-8 rounded-md" />
                        <span className="font-semibold">{g.title}</span>
                        {g.firstParty && <Badge tone="brand">1st</Badge>}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {g.launchMethods.map((m) => ({ browser: "Browser", install: "Install", server: "Servers" })[m]).join(" · ")}
                    </td>
                    <td className="px-4 py-2.5">{Intl.NumberFormat("en").format(g.playersOnline)}</td>
                    <td className={cn("px-4 py-2.5 font-semibold", g.weeklyGrowth >= 10 ? "text-play" : g.weeklyGrowth < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {g.weeklyGrowth >= 0 ? "+" : ""}
                      {g.weeklyGrowth}%
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone="play">
                        <CheckCircle2 className="size-3" /> Published
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-8">
          {/* Submissions */}
          <section>
            <SectionHeader title="Developer Submissions" subtitle="Third-party developer portal queue" />
            <div className="space-y-3">
              {submissions.map((s) => (
                <div key={s.title} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-bold">
                      <Upload className="size-4 text-primary" /> {s.title}
                    </p>
                    <Badge tone={s.status === "In review" ? "brand" : "warn"}>{s.status}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    by {s.dev} · {s.type} · submitted {s.submitted}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-full bg-play px-3.5 py-1 text-xs font-bold text-play-foreground transition-all hover:brightness-110">
                      Approve
                    </button>
                    <button className="rounded-full bg-secondary px-3.5 py-1 text-xs font-bold transition-colors hover:bg-secondary/70">
                      Review Build
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Automation */}
          <section>
            <SectionHeader title="Automation" subtitle="The platform runs itself" />
            <div className="overflow-hidden rounded-xl border border-border">
              {automation.map((a, i) => (
                <div key={a.task} className={cn("flex items-center gap-3 bg-card px-4 py-3", i > 0 && "border-t border-border")}>
                  {a.status === "ok" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-play" />
                  ) : (
                    <RefreshCw className="size-4 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.task}</p>
                    {"note" in a && a.note && <p className="truncate text-xs text-amber-400">{a.note}</p>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> {a.last}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="size-3.5" /> Prototype note: this dashboard renders demo data. Wire it to
        MongoDB models in <code className="rounded bg-secondary px-1 py-0.5">src/lib/models</code> when the
        backend lands. <BarChart3 className="ml-2 size-3.5" /> Per-game analytics dashboards ship with it.
      </p>
    </div>
  );
}
