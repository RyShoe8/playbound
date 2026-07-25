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
import { ONE_CLICK_SLUGS, launcherInstallUrl } from "@/lib/launcher";
import { GameArt } from "@/components/GameArt";
import { Badge, SectionHeader } from "@/components/ui/bits";

export const metadata: Metadata = { title: "PlayBound Launcher" };

const features = [
  { icon: Download, title: "One-click installs", text: "Portable builds pulled straight from each project's official releases — no wizards, no toolbars, no surprises." },
  { icon: Play, title: "One-click launches", text: "After the first install, playing is a single click. The launcher finds the executable for you." },
  { icon: RefreshCw, title: "Automatic updates", text: "The launcher resolves the latest release every time, so installs never go stale." },
  { icon: Cloud, title: "Cloud saves", text: "Coming soon — sync your saves across machines for supported games." },
  { icon: Server, title: "Server hosting", text: "Coming soon — host dedicated servers for supported games in one click." },
  { icon: Wrench, title: "Mod management", text: "Coming soon — install and update mods without touching a config file." },
];

export default function LauncherPage() {
  const oneClick = gamesFor([...ONE_CLICK_SLUGS]);

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
          Install, update, and launch free PC games with one click. Game pages hand off via{" "}
          <code className="text-play">playbound://</code> deep links — the launcher grabs the latest
          official build and puts it on your machine.
        </p>
        <div className="mt-6 rounded-xl border border-border bg-background/60 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Download className="size-4 text-play" /> Packaged Windows builds
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            From the repo, run <code className="text-play">npm run dist</code> in{" "}
            <code className="text-play">launcher/</code> to produce{" "}
            <code className="text-play">PlayBound-Launcher-Setup-0.1.0.exe</code> (installer) and{" "}
            <code className="text-play">PlayBound-Launcher-Portable-0.1.0.exe</code>. Install or run
            once — the app registers <code className="text-play">playbound://</code> so one-click
            links from this site open the launcher.
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm font-bold">
            <Terminal className="size-4 text-play" /> Or run the beta from source
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-play">
            {`git clone https://github.com/RyShoe8/playbound
cd playbound/launcher
npm install
npm start`}
          </pre>
        </div>
      </section>

      {/* One-click games */}
      <section>
        <SectionHeader
          title="One-Click Install Today"
          subtitle="Click a tile to open the launcher and start installing (requires the beta running once)"
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
          {oneClick.map((g) => (
            <a key={g.slug} href={launcherInstallUrl(g.slug)} className="group">
              <GameArt
                game={g}
                iconSize="md"
                className="aspect-[3/4] rounded-xl border border-border transition-all group-hover:-translate-y-1 group-hover:border-primary/40"
              />
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Every other game in the catalog gets an official-site button, and moves to one-click as we
          add it. Prefer browsing first?{" "}
          <Link href="/games" className="font-semibold text-primary hover:underline">
            Browse the catalog
          </Link>
          .
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
