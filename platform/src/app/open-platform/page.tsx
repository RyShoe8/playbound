import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Cpu,
  Download,
  ExternalLink,
  Flame,
  Gamepad2,
  GitBranch,
  GitPullRequest,
  Globe2,
  Layers,
  Lock,
  Package,
  Radio,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { Badge, SectionHeader } from "@/components/ui/bits";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { LauncherHeroDownload } from "@/components/LauncherHeroDownload";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className || "size-4"}
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export const metadata: Metadata = pageMetadata({
  title: "Open Platform — Auditable, Ad-Free, No Spyware",
  description:
    "Explore PlayBound's 100% open-source launcher architecture. Zero background spyware, no bloatware, open manifest recipes, and a clear boundary for exclusive community games.",
  path: "/open-platform",
});

const GITHUB_REPO_URL = "https://github.com/RyShoe8/playbound";

const guarantees = [
  {
    icon: Code2,
    badge: "100% Transparent",
    title: "Auditable, Open-Source Core",
    text: "The PlayBound desktop app is open-source. Anyone can inspect every single line of code, verify that we do not bundle spyware or crypto miners, and build it themselves from scratch.",
    highlight: "Inspect every process & IPC call",
  },
  {
    icon: Zap,
    badge: "Ultra Lightweight",
    title: "Zero Bloatware, Zero Memory Leaks",
    text: "Unlike corporate launchers that hog gigabytes of RAM and keep heavy background telemetry services running 24/7, PlayBound stays lean and goes completely quiet when your game starts.",
    highlight: "< 90 MB memory footprint",
  },
  {
    icon: GitPullRequest,
    badge: "Community Manifests",
    title: "Pull Requests for Any Game or Port",
    text: "Engine source ports and fan restorations move fast. Our installation recipes and manifest definitions are open for community Pull Requests, fixes, and engine updates.",
    highlight: "Submit source ports & fixes",
  },
  {
    icon: ShieldCheck,
    badge: "Safe Downloads",
    title: "Official Releases & Checksum Verification",
    text: "Downloads are resolved directly from official creator repositories, developer GitHub releases, or authoritative mirrors. Every archive is verified with SHA-256 and MD5 hashes before execution.",
    highlight: "Cryptographic hash verified",
  },
];

const fatiguePoints = [
  {
    bad: "Heavy background daemons running 24/7",
    good: "Zero persistent services. Exits cleanly when you close it.",
  },
  {
    bad: "Invasive tracking, data mining, and targeted ads",
    good: "No user tracking, no ad networks, no data brokers.",
  },
  {
    bad: "Locked proprietary storefronts with closed ecosystems",
    good: "Open manifest architecture that supports community source ports.",
  },
  {
    bad: "Walled-garden friends lists and isolated parties",
    good: "Cross-game room matching with seamless Discord integration.",
  },
];

export default function OpenPlatformPage() {
  return (
    <div className="space-y-16 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "AboutPage",
            name: "PlayBound Open Platform & Architecture",
            url: absoluteUrl("/open-platform"),
            description:
              "The open-source foundation, trust guarantees, and modular architecture behind PlayBound.",
            publisher: { "@id": ORGANIZATION_ID },
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Open Platform", path: "/open-platform" },
          ])
        )}
      />

      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-card to-card p-6 sm:p-12 lg:p-16">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        
        <div className="max-w-3xl space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">
              <Code2 className="size-3" /> Open Platform
            </Badge>
            <Badge tone="neutral">
              <ShieldCheck className="size-3 text-play" /> Trust & Architecture
            </Badge>
            <Badge tone="neutral">MIT License</Badge>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground">
            A launcher you can actually <span className="text-primary">trust</span>.
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
            Gamers are tired of heavy, invasive launchers that hog system resources and mine user data.
            PlayBound is built on an <strong className="text-foreground">open-source, transparent foundation</strong> designed to be fast, neutral, and respectful of your PC.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-all hover:bg-foreground/90 hover:shadow-lg"
            >
              <GitHubIcon className="size-4" /> View on GitHub
            </a>
            <Link
              href="/launcher"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/80 px-6 py-3 text-sm font-bold text-foreground transition-all hover:bg-secondary"
            >
              <Download className="size-4 text-primary" /> Download Launcher
            </Link>
          </div>
        </div>
      </section>

      {/* Why PlayBound is Different: Addressing Launcher Fatigue */}
      <section className="space-y-6">
        <SectionHeader
          title="Ending 'Launcher Fatigue'"
          subtitle="Why another launcher? Because every existing corporate launcher got bloated, intrusive, and closed."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {fatiguePoints.map((item, idx) => (
            <div
              key={idx}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40"
            >
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 text-sm text-destructive font-medium line-through opacity-85">
                  <ShieldAlert className="size-4 shrink-0 text-destructive mt-0.5" />
                  <span>{item.bad}</span>
                </div>
                <div className="flex items-start gap-2.5 text-base font-bold text-foreground">
                  <CheckCircle2 className="size-5 shrink-0 text-play mt-0.5" />
                  <span>{item.good}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The 4 Guarantees */}
      <section className="space-y-6">
        <SectionHeader
          title="The Open Platform Guarantee"
          subtitle="Built from first principles for total security, zero surveillance, and complete user control."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {guarantees.map((g) => {
            const Icon = g.icon;
            return (
              <div
                key={g.title}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card/60 p-6 transition-all hover:-translate-y-1 hover:border-primary/50 hover:bg-card"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Icon className="size-6" />
                    </div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      {g.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-foreground">{g.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{g.text}</p>
                </div>

                <div className="mt-6 border-t border-border/60 pt-3">
                  <span className="text-xs font-semibold text-primary">{g.highlight}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Architecture Visualized */}
      <section className="rounded-3xl border border-border bg-gradient-to-b from-card to-background p-6 sm:p-10 lg:p-12 space-y-8">
        <div className="max-w-2xl space-y-2">
          <Badge tone="brand">
            <Layers className="size-3" /> Visual Architecture
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            How the pieces connect cleanly
          </h2>
          <p className="text-sm text-muted-foreground">
            A clear architectural boundary separates the open-source client engine from the distribution manifest and standalone game projects.
          </p>
        </div>

        {/* Visual Architecture Diagram */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Layer 1 */}
          <div className="relative rounded-2xl border-2 border-primary/40 bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
                Layer 1: Client Core
              </span>
              <GitHubIcon className="size-5 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold">Open Launcher Core</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Electron runtime, local save snapshots, 7-Zip package extractor, SHA-256 verification, and hardware compatibility checks.
            </p>
            <ul className="mt-4 space-y-1.5 text-xs text-foreground/90 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> 100% Open source repository
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> Encrypted local credential vault
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> Strict domain & execution sandbox
              </li>
            </ul>
          </div>

          {/* Layer 2 */}
          <div className="relative rounded-2xl border border-border bg-card/60 p-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">
                Layer 2: Standard API
              </span>
              <Radio className="size-5 text-primary" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold">Manifest & Discovery API</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Dynamic JSON manifests that describe download mirrors, checksums, launch flags, mod folders, and server status.
            </p>
            <ul className="mt-4 space-y-1.5 text-xs text-foreground/90 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> Declarative installation recipes
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> Live server pinging & telemetry
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> Community contribution via PRs
              </li>
            </ul>
          </div>

          {/* Layer 3 */}
          <div className="relative rounded-2xl border border-border bg-card/60 p-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">
                Layer 3: Content Ecosystem
              </span>
              <Gamepad2 className="size-5 text-accent" />
            </div>
            <h3 className="mt-4 text-xl font-extrabold">Independent Games & IP</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Community source ports, retro classics, and custom first-party multiplayer experiences running in standalone repositories.
            </p>
            <ul className="mt-4 space-y-1.5 text-xs text-foreground/90 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> Respects original game creators
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> Separate IP & licensing boundaries
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-play" /> Zero proprietary lock-in
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Dual CTA: For Players vs For Developers */}
      <section className="grid gap-6 sm:grid-cols-2">
        {/* For Players */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-gradient-to-br from-card via-card to-primary/10 p-8 sm:p-10">
          <div className="space-y-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-play/20 text-play">
              <Gamepad2 className="size-6" />
            </div>
            <h3 className="text-2xl font-extrabold tracking-tight">For Players</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Get one-click installs for classic games, community multiplayer source ports, automatic save syncing, and frictionless party lobbies.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/launcher"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
            >
              <Download className="size-4" /> Download Launcher
            </Link>
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-6 py-3 text-sm font-bold text-foreground transition-all hover:bg-secondary/80"
            >
              Browse Games
            </Link>
          </div>
        </div>

        {/* For Developers & Modders */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-gradient-to-br from-card via-card to-foreground/5 p-8 sm:p-10">
          <div className="space-y-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/10 text-foreground">
              <Terminal className="size-6" />
            </div>
            <h3 className="text-2xl font-extrabold tracking-tight">For Developers & Source Porters</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Have an engine port, total conversion mod, or freeware recreation? Submit a manifest recipe to bring seamless installs and multiplayer lobbies to thousands of players.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-all hover:bg-foreground/90"
            >
              <GitHubIcon className="size-4" /> Contribute on GitHub
            </a>
            <Link
              href="/submit-game"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-6 py-3 text-sm font-bold text-foreground transition-all hover:bg-secondary/80"
            >
              Submit a Game <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
