import Link from "next/link";
import type { Metadata } from "next";
import {
  Cloud,
  Cpu,
  Download,
  FolderSearch,
  Gamepad2,
  Layers,
  MonitorPlay,
  Network,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { listDiscoverableGames } from "@/lib/access/discover";
import { isLauncherInstallable, launcherInstallUrl } from "@/lib/launcher";
import { LauncherHeroDownload } from "@/components/LauncherHeroDownload";
import { GameArt } from "@/components/GameArt";
import { Badge, SectionHeader } from "@/components/ui/bits";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "PlayBound Launcher — Install, Play, and Party Up in One Click",
  description:
    "A free desktop app for free games. One-click installs from official releases, cloud saves, mod management, and parties that land everyone in the same game.",
  path: "/launcher",
});

/**
 * Every claim on this page maps to something the launcher actually does. When
 * a feature changes shape, the copy here changes with it — a marketing page
 * that oversells is the same bug as a wrong tooltip, just further from the
 * code.
 */
const pillars = [
  {
    icon: Download,
    title: "One-click installs",
    text: "Portable builds pulled straight from each project's own releases. No wizards, no toolbars, no mirrors we do not control.",
  },
  {
    icon: Play,
    title: "One-click launches",
    text: "The launcher remembers where every game lives and what it needs to start. After the first install, playing is one click.",
  },
  {
    icon: RefreshCw,
    title: "Never goes stale",
    text: "Releases are resolved fresh every time, and the launcher updates itself in the background.",
  },
  {
    icon: Cpu,
    title: "Knows your PC",
    text: "Reads your hardware once and can hide anything that will not run well on it, so the catalog you browse is the catalog you can actually play.",
  },
  {
    icon: Cloud,
    title: "Cloud saves",
    text: "Snapshot, upload, and restore your saves across machines. Supported for 24 games and counting.",
  },
  {
    icon: Wrench,
    title: "Mod management",
    text: "Install community mods into the right folder with one click. Existing files are backed up first, never overwritten.",
  },
  {
    icon: Layers,
    title: "Editions",
    text: "Some games have more than one way to play — vanilla, a multiplayer fork, a modded build. Pick one; they install side by side.",
  },
  {
    icon: FolderSearch,
    title: "Finds what you own",
    text: "Scans for games you already installed elsewhere and adopts them, so your library is not split in two.",
  },
  {
    icon: Gamepad2,
    title: "Runtimes handled",
    text: "Java games get a managed runtime installed for them. No hunting for the right JDK.",
  },
];

const social = [
  {
    icon: Users,
    title: "Friends and parties",
    text: "See who is online and what they are in. Ready up, chat, and launch together — with voice, if Discord is linked.",
    href: "/friends",
    linkLabel: "Open Friends",
  },
  {
    icon: Network,
    title: "PlayBound Connect",
    text: "Click Join Game and everyone lands in the same game. Connect hosts a dedicated room for games that need a server, and puts your party on one shared network for games that only find friends over LAN.",
    href: "/connect",
    linkLabel: "How Connect works",
  },
  {
    icon: Server,
    title: "Live server browser",
    text: "Public community servers for dozens of titles, pinged live so you can see what is actually up before you join.",
    href: "/servers",
    linkLabel: "Browse servers",
  },
];

const steps = [
  {
    title: "Download and run it once",
    text: "That first run registers playbound:// links, which is what makes every Install button on this site work.",
  },
  {
    title: "Install anything in one click",
    text: "From the launcher or from any game page here. The download comes from the project's official release.",
  },
  {
    title: "Play, and bring people",
    text: "Start a party, invite friends, hit Join Game. Everything from the room to the voice channel is handled for you.",
  },
];

export default async function LauncherPage() {
  const games = await listDiscoverableGames();
  const installable = games.filter((g) => isLauncherInstallable(g));

  return (
    <div className="space-y-14 px-4 py-6 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "SoftwareApplication",
            name: "PlayBound Launcher",
            applicationCategory: "GameApplication",
            operatingSystem: "Windows, macOS, Linux",
            url: absoluteUrl("/launcher"),
            description:
              "Free desktop launcher for free PC games. One-click installs from official releases, cloud saves, mod management, and parties.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            publisher: { "@id": ORGANIZATION_ID },
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Launcher", path: "/launcher" },
          ])
        )}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/25 via-card to-card p-6 sm:p-10">
        <Badge tone="brand">
          <MonitorPlay className="size-3" /> Desktop App · Beta
        </Badge>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Free games, one click away.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          The PlayBound Launcher installs, updates, and launches free PC games for you — pulling
          every build from the project&apos;s own release, never a mirror. No account required to
          install anything.
        </p>
        <LauncherHeroDownload />
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-play" /> Official sources only
          </span>
          {/* A failed catalog read would otherwise advertise "0 games installable". */}
          {installable.length > 0 ? (
            <span className="flex items-center gap-2">
              <Download className="size-4 text-play" /> {installable.length} games installable today
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            <Cloud className="size-4 text-play" /> Free, no account to install
          </span>
        </div>
        <p className="mt-6 max-w-xl text-xs text-muted-foreground">
          Windows may show an &quot;unrecognized app&quot; SmartScreen warning because the installer is still
          building reputation. Choose <span className="font-semibold text-foreground">More info</span>, then{" "}
          <span className="font-semibold text-foreground">Run anyway</span>. Once we ship signed builds, the
          publisher will show as PlayBound.
        </p>
      </section>

      <section>
        <SectionHeader
          title="How it works"
          subtitle="Three steps, and only the first one is ever more than a click."
        />
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-border bg-card p-5">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary">
                {i + 1}
              </span>
              <h3 className="mt-3 text-base font-bold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionHeader
          title="What it does"
          subtitle="Built for discovering, installing, and playing free games fast."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-border bg-card/40 p-5">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Icon className="size-4 text-play" /> {title}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/10 p-6 sm:p-8">
        <SectionHeader
          title="Playing together is the point"
          subtitle="Half of these games are better with people in them, so the launcher does the hard part."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {social.map(({ icon: Icon, title, text, href, linkLabel }) => (
            <div key={title} className="rounded-xl border border-border bg-background/40 p-5">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Icon className="size-4 text-primary" /> {title}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              <Link
                href={href}
                className="mt-3 inline-block text-xs font-bold text-primary hover:underline"
              >
                {linkLabel} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="hidden lg:block">
        <SectionHeader
          title="One-click install"
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

      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <SectionHeader title="Questions worth answering up front" />
        <dl className="grid gap-6 sm:grid-cols-2">
          {[
            {
              q: "Is it free?",
              a: "Yes, and so is every game in the catalog. PlayBound never lists a paid title, and you do not need an account to install anything. An account gets you friends, parties, and cloud saves.",
            },
            {
              q: "Where do the downloads come from?",
              a: "Each project's own release — the developer's site, their GitHub releases, or their itch page. The launcher resolves the current version at install time rather than caching a copy.",
            },
            {
              q: "What about my existing games?",
              a: "The launcher can scan for games you installed some other way and adopt them into your library, so you are not running two launchers side by side.",
            },
            {
              q: "Does it work on macOS and Linux?",
              a: "Yes — macOS and Linux builds are available, though Windows gets the most testing and the widest game coverage.",
            },
            {
              q: "Do I have to open ports to play with friends?",
              a: "No. PlayBound Connect either hosts the room on a public server that everyone connects out to, or puts your party on one shared private network. Neither needs anything from your router.",
            },
            {
              q: "Can I uninstall cleanly?",
              a: "Games install to a folder you choose and uninstall from the launcher. Save backups are kept outside the game folder on purpose, so removing a game never takes its saves with it.",
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <dt className="text-sm font-bold">{q}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-card to-card p-8 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight">Ready when you are.</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Download it, run it once, and every Install button on PlayBound turns into a single click.
        </p>
        <div className="flex justify-center">
          <LauncherHeroDownload />
        </div>
      </section>
    </div>
  );
}
