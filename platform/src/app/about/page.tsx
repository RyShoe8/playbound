import type { Metadata } from "next";
import Link from "next/link";
import {
  Sparkles,
  ShieldCheck,
  Download,
  Gamepad2,
  Users,
  Server,
  Zap,
  Gift,
  HeartHandshake,
  ArrowRight,
  Terminal,
  Layers,
} from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { withOutboundUtm } from "@/lib/utm";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { listGames } from "@/lib/catalog";

export const metadata: Metadata = pageMetadata({
  title: "About PlayBound — High-Quality Free Games, Zero Catch",
  description:
    "PlayBound is the premier destination and lightweight launcher for genuinely free, high-quality games. Learn about our mission, curation bar, and open gaming ecosystem.",
  path: "/about",
});

const mediaShopHref = withOutboundUtm("https://themediashop.co", { campaign: "about_page" });

export default async function AboutPage() {
  const games = await listGames();
  const verifiedCount = games.filter((g) => g.qualityBar).length;

  const pillars = [
    {
      icon: ShieldCheck,
      title: "Genuinely Free",
      description:
        "No predatory monetization, no pay-to-win microtransactions, no paywalled core campaigns, and no cosmetic FOMO treadmills. Every title is 100% complete and free.",
    },
    {
      icon: Sparkles,
      title: "Hand-Curated Standards",
      description:
        "We don't inflate our library with thousands of shovelware titles. Every single game is tested and played before it is added, then evaluated against the 4-point PlayBound Bar.",
    },
    {
      icon: Download,
      title: "One-Click Launcher",
      description:
        "Our open, lightweight desktop launcher automates downloads, dependency handling, and updates from official developer releases with zero bloat or DRM.",
    },
    {
      icon: Users,
      title: "Multiplayer & Parties",
      description:
        "Join active community servers, organize parties with friends, and coordinate seamlessly with our Discord bot — without vendor lock-in.",
    },
    {
      icon: Gift,
      title: "Aggregated Free Deals",
      description:
        "Daily automated discovery across Epic Games Store, Steam, GOG, and Prime Gaming so you never miss limited-time 100% free promotions.",
    },
    {
      icon: Layers,
      title: "Preservation & Modding",
      description:
        "Supporting open-source engines, standalone fan projects, and curated mod ecosystems that keep legendary games thriving for decades.",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "AboutPage",
            name: "About PlayBound",
            url: absoluteUrl("/about"),
            description:
              "Learn about PlayBound's mission to curate high-quality free games and provide an open, privacy-first gaming ecosystem.",
            publisher: { "@id": ORGANIZATION_ID },
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ])
        )}
      />

      {/* Hero Header */}
      <header className="space-y-4 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Zap className="h-3.5 w-3.5" />
          The PlayBound Mission
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          High-Quality Free Games. <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-primary via-accent-foreground to-primary bg-clip-text text-transparent">
            Actually Worth Your Time.
          </span>
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          We built PlayBound to solve a fundamental problem in modern gaming: great free games exist,
          but they get drowned out by pay-to-win microtransactions, algorithmic store clutter, and
          monetization pressure.
        </p>
      </header>

      {/* Quick Stats Grid */}
      <div className="my-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-card/50 p-4 text-center">
          <div className="text-2xl font-black text-foreground sm:text-3xl">{games.length}+</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Curated Games</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/50 p-4 text-center">
          <div className="text-2xl font-black text-primary sm:text-3xl">100%</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Free to Play</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/50 p-4 text-center">
          <div className="text-2xl font-black text-foreground sm:text-3xl">{verifiedCount}</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Quality Verified</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/50 p-4 text-center">
          <div className="text-2xl font-black text-primary sm:text-3xl">$0</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Cost to Players</div>
        </div>
      </div>

      {/* Origin Story / Manifesto */}
      <section className="space-y-4 rounded-2xl border border-border bg-gradient-to-b from-card/80 to-card/30 p-6 sm:p-8">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Why PlayBound Exists
        </h2>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          <p>
            The mainstream video game industry has increasingly shifted toward aggressive live-service
            models, battle passes, loot boxes, and dark UX patterns designed to extract time and money.
            Meanwhile, passionate independent developers, open-source maintainers, and community teams
            have quietly built extraordinary, full-featured games that ask for nothing in return.
          </p>
          <p>
            The problem is discovery. Finding these gems usually requires digging through forum threads,
            compiling GitHub repositories, and manually configuring dependencies.
          </p>
          <p>
            <strong>PlayBound changes that.</strong> We provide a sleek, centralized catalog and an
            integrated desktop launcher that turns great free software into seamless one-click experiences.
            No ads, no bundled spyware, and no paywalls.
          </p>
        </div>
      </section>

      {/* Pillars Grid */}
      <section className="my-12 space-y-6">
        <div className="text-center sm:text-left">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">What Sets Us Apart</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How we maintain the highest quality catalog on the web.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="flex flex-col rounded-xl border border-border/70 bg-card/40 p-5 transition-colors hover:border-primary/40 hover:bg-card/70"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-foreground">{pillar.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* The PlayBound Bar Callout */}
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">The PlayBound Standard</h2>
            <p className="text-sm text-muted-foreground">
              Every game is tested and played before it is added, and must clear our 4-point
              evaluation: genuinely free, ready to play, curated through thorough testing, and high
              quality or showing strong potential.
            </p>
          </div>
          <Link
            href="/standards"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            Read Our Standard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Operator & Community Transparency */}
      <section className="mt-12 space-y-4 border-t border-border pt-10">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Built &amp; Operated by The Media Shop
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          PlayBound is operated by{" "}
          <a
            href={mediaShopHref}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            The Media Shop
          </a>
          . We are committed to maintaining a clean, privacy-respecting platform. We do not sell user
          data, run intrusive tracking scripts, or compromise our curation integrity.
        </p>
        <div className="flex flex-wrap gap-4 pt-2">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground/30 hover:bg-card/80"
          >
            <Gamepad2 className="h-4 w-4 text-primary" />
            Browse Catalog
          </Link>
          <Link
            href="/launcher"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground/30 hover:bg-card/80"
          >
            <Download className="h-4 w-4 text-primary" />
            Get the Launcher
          </Link>
          <Link
            href="/privacy"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground/30 hover:bg-card/80"
          >
            <ShieldCheck className="h-4 w-4 text-primary" />
            Privacy Policy
          </Link>
        </div>
      </section>
    </div>
  );
}
