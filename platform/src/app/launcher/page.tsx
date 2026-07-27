import Link from "next/link";
import type { Metadata } from "next";
import {
  Cloud,
  Download,
  MonitorPlay,
  Play,
  RefreshCw,
  Server,
  Wrench,
} from "lucide-react";
import { listGames } from "@/lib/catalog";
import { isLauncherInstallable, launcherInstallUrl } from "@/lib/launcher";
import { getLauncherDownloadUrl } from "@/lib/launcherDownload";
import { GameArt } from "@/components/GameArt";
import { Badge, SectionHeader } from "@/components/ui/bits";

export const metadata: Metadata = { title: "PlayBound Launcher" };

const features = [
  { icon: Download, title: "One-click installs", text: "Portable builds pulled straight from each project's official releases — no wizards, no toolbars, no surprises." },
  { icon: Play, title: "One-click launches", text: "After the first install, playing is a single click. The launcher finds the executable for you." },
  { icon: RefreshCw, title: "Automatic updates", text: "The launcher resolves the latest release every time, so installs never go stale." },
  { icon: Cloud, title: "Cloud saves", text: "Coming soon — sync your saves across machines for supported games." },
  { icon: Server, title: "Server hosting", text: "Coming soon — host dedicated servers for supported games in one click." },
  { icon: Wrench, title: "Mod management", text: "Install community mods into your game folder with one click — the launcher finds where the base game lives." },
];

export default async function LauncherPage() {
  const [games, downloadUrl] = await Promise.all([listGames(), Promise.resolve(getLauncherDownloadUrl())]);
  const installable = games.filter((g) => isLauncherInstallable(g));

  return (
    <div className="space-y-12 px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/25 via-card to-card p-6 sm:p-10">
        <Badge tone="brand">
          <MonitorPlay className="size-3" /> Desktop App · Beta
        </Badge>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight">
          The PlayBound Launcher
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Install, update, and launch free games with one click — no account required. Download the
          Windows app, run it once so <code className="text-play">playbound://</code> deep links work,
          then install any game from this site in a single click.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-2 rounded-full bg-play px-6 py-3 text-sm font-bold text-play-foreground transition-all hover:brightness-110"
            >
              <Download className="size-4" /> Download for Windows
            </a>
          ) : (
            <p className="rounded-lg border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              Download URL not configured. Set{" "}
              <code className="text-play">NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL</code> after uploading the
              Setup.exe to Vercel Blob.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Windows 10/11 · ~78 MB · run once to register deep links
          </p>
        </div>
      </section>

      <section>
        <SectionHeader
          title="One-Click Install"
          subtitle="Click a tile to open the launcher and start installing. Requires the launcher downloaded and run once."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {installable.map((g) => (
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
          Prefer browsing first?{" "}
          <Link href="/games" className="font-semibold text-primary hover:underline">
            Browse the catalog
          </Link>
          .
        </p>
      </section>

      <section>
        <SectionHeader title="What it does" subtitle="Built for discovering, installing, and playing free games fast." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-border bg-card/40 p-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Icon className="size-4 text-play" /> {title}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
