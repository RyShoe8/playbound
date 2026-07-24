import Link from "next/link";
import type { Metadata } from "next";
import {
  Bell,
  Cloud,
  Download,
  MonitorPlay,
  Play,
  RefreshCw,
  Server,
  Terminal,
  Wrench,
} from "lucide-react";
import { games, gamesFor } from "@/lib/data";
import { GameArt } from "@/components/GameArt";
import { Badge, SectionHeader } from "@/components/ui/bits";

export const metadata: Metadata = { title: "PlayBound Launcher" };

/** Games with working one-click install in the launcher beta. */
const oneClickSlugs = [
  "openra",
  "endless-sky",
  "warzone-2100",
  "supertuxkart",
  "luanti",
  "xonotic",
  "naev",
];

const features = [
  { icon: Download, title: "One-click installs", text: "Portable builds pulled straight from each project's official releases — no wizards, no toolbars, no surprises." },
  { icon: Play, title: "One-click launches", text: "After the first install, playing is a single click. The launcher finds the executable for you." },
  { icon: RefreshCw, title: "Automatic updates", text: "The launcher resolves the latest release every time, so installs never go stale." },
  { icon: Cloud, title: "Cloud saves", text: "Coming soon — sync your saves across machines for supported games." },
  { icon: Server, title: "Server hosting", text: "Coming soon — host dedicated servers for supported games in one click." },
  { icon: Wrench, title: "Mod management", text: "Coming soon — install and update mods without touching a config file." },
];

export default function LauncherPage() {
  const oneClick = gamesFor(oneClickSlugs);

  return (
    <div className="space-y-12 px-4 py-6 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/25 via-card to-card p-6 sm:p-10">
        <Badge tone="brand">
          <MonitorPlay className="size-3" /> Desktop App · Beta
        </Badge>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight">
          The PlayBound Launcher
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Install, update, and launch free PC games with one click. The website is where you
          discover — the launcher is how installed games get effortless. Optional, lightweight, and
          it only ever downloads official builds.
        </p>
        <div className="mt-6 rounded-xl border border-border bg-background/60 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Terminal className="size-4 text-play" /> Run the beta from source
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-play">
            {`git clone https://github.com/RyShoe8/playbound
cd playbound/launcher
npm install
npm start`}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Windows-first for now. Packaged one-file downloads (.exe) arrive with the launcher&apos;s
            1.0 release.
          </p>
        </div>
      </section>

      {/* One-click games */}
      <section>
        <SectionHeader
          title="One-Click Install Today"
          subtitle="These games install and launch through the beta right now"
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
          {oneClick.map((g) => (
            <Link key={g.slug} href={`/games/${g.slug}`} className="group">
              <GameArt
                game={g}
                iconSize="md"
                className="aspect-[3/4] rounded-xl border border-border transition-all group-hover:-translate-y-1 group-hover:border-primary/40"
              />
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Every other game in the catalog gets an official-site button in the launcher, and moves to
          one-click as we add it.
        </p>
      </section>

      {/* Feature grid */}
      <section>
        <SectionHeader title="What It Does" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-5">
              <Icon className="size-5 text-primary" />
              <p className="mt-2.5 font-bold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 text-center">
        <Bell className="mx-auto size-6 text-primary" />
        <p className="mt-2 font-bold">The website stays the primary experience.</p>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          Browser games launch instantly with no launcher at all, and everything on PlayBound —
          discovery, community, servers, events — lives right here. The launcher just makes native
          installs painless. {games.filter((g) => g.browserPlayable).length} games need nothing but
          this tab.
        </p>
      </section>
    </div>
  );
}
