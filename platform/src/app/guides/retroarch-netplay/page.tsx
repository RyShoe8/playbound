import Link from "next/link";
import { Joystick, ArrowRight, Sparkles } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/bits";
import {
  JsonLd,
  graph,
  faqSchema,
  breadcrumbSchema,
  ORGANIZATION_ID,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Play GOG Neo Geo Games Online with RetroArch Netplay",
  description:
    "Buy DRM-free Neo Geo sports titles on GOG, install through Galaxy, then play online with friends using PlayBound Connect and RetroArch netplay — no port forwarding.",
  path: "/guides/retroarch-netplay",
});

const featuredGames = [
  {
    slug: "super-sidekicks",
    title: "Super Sidekicks",
    blurb: "Neo Geo national-team soccer with aftertouch shots.",
  },
  {
    slug: "baseball-stars-2",
    title: "Baseball Stars 2",
    blurb: "Create-a-team diamond drama and two-player showdowns.",
  },
  {
    slug: "soccer-brawl",
    title: "Soccer Brawl",
    blurb: "Five-a-side Neo Geo football with arcade contact.",
  },
];

const faq = [
  {
    q: "Do I need to pirate a ROM?",
    a: "No. Buy the DRM-free GOG release. PlayBound never hosts installers or ROMs. Connect launches RetroArch against the game data from your legal install.",
  },
  {
    q: "Do I need GOG Galaxy?",
    a: "Galaxy is the one-click Install path from the PlayBound launcher (goggalaxy://). You can also use GOG's offline installer; PlayBound still detects common GOG Games folders.",
  },
  {
    q: "Why RetroArch instead of the Windows .exe?",
    a: "The GOG Windows ports are excellent for local play, but online head-to-head uses RetroArch netplay (FBNeo) so both clients sync inputs over PlayBound Connect's virtual LAN.",
  },
  {
    q: "What is neogeo.zip?",
    a: "FBNeo needs the Neo Geo BIOS in RetroArch's system folder. GOG typically bundles what you need with a legal purchase. If a game will not boot in RetroArch, confirm system/neogeo.zip is present.",
  },
  {
    q: "Is PlayBound Connect free?",
    a: "Yes. Virtual LAN bridging and party play are free in the PlayBound desktop client.",
  },
];

const howToSteps = [
  {
    name: "Own the GOG title",
    text: "Purchase Super Sidekicks, Baseball Stars 2, or Soccer Brawl on GOG if you do not already own it.",
  },
  {
    name: "Install from PlayBound",
    text: "In the PlayBound launcher, click Install. That opens GOG Galaxy on the owned product so you can install in one hop.",
  },
  {
    name: "Wait for detection",
    text: "PlayBound polls common GOG Galaxy Games paths (and ROM zip names like ssideki.zip). Use Locate if needed.",
  },
  {
    name: "Create a Connect party",
    text: "Invite your friend in PlayBound. Connect puts both PCs on the same virtual LAN — no port forwarding.",
  },
  {
    name: "Host and join",
    text: "The host clicks Play (RetroArch starts with netplay host). Friends click Join Game. Controllers work through RetroArch's native pad support.",
  },
];

export default function RetroArchNetplayGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "Article",
            headline: "Play GOG Neo Geo Games Online with RetroArch Netplay",
            description:
              "Buy DRM-free Neo Geo sports titles on GOG, install through Galaxy, then play online with friends using PlayBound Connect and RetroArch netplay.",
            url: absoluteUrl("/guides/retroarch-netplay"),
            author: { "@id": ORGANIZATION_ID },
            publisher: { "@id": ORGANIZATION_ID },
            isAccessibleForFree: true,
          },
          faqSchema(faq),
          {
            "@type": "HowTo",
            name: "How to play GOG Neo Geo sports titles online with PlayBound Connect",
            description:
              "Buy on GOG, Galaxy one-click install, detect in PlayBound, then RetroArch netplay over Connect.",
            step: howToSteps.map((s, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              name: s.name,
              text: s.text,
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
            { name: "RetroArch Netplay", path: "/guides/retroarch-netplay" },
          ])
        )}
      />

      <div className="max-w-2xl">
        <Badge tone="brand">
          <Joystick className="size-3.5" /> RetroArch & Connect
        </Badge>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          Play GOG Neo Geo Sports Online
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Own the DRM-free GOG master, install through Galaxy from PlayBound, then settle the match
          online with RetroArch netplay over PlayBound Connect — no port forwarding, no pirated ROMs.
        </p>
      </div>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-bold tracking-tight">How it works</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {howToSteps.map((step) => (
            <li key={step.name}>
              <span className="font-semibold text-foreground">{step.name}.</span> {step.text}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight">Featured titles</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Each catalog page links back here from its install steps.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {featuredGames.map((game) => (
            <Link
              key={game.slug}
              href={`/games/${game.slug}`}
              className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <h3 className="font-bold tracking-tight group-hover:text-primary">{game.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{game.blurb}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                Open game <ArrowRight className="size-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-bold tracking-tight">BIOS and ROM names</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Connect launches managed RetroArch with the FBNeo core. Neo Geo sets often need{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">neogeo.zip</code> under RetroArch&apos;s{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">system/</code> folder. PlayBound looks for
          legal set names such as <code className="rounded bg-muted px-1 py-0.5 text-xs">ssideki.zip</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">bstars2.zip</code>, and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">socbrawl.zip</code> inside your GOG install —
          we never redistribute them.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-bold tracking-tight">FAQ</h2>
        <dl className="space-y-4">
          {faq.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-5">
        <Sparkles className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Need the Connect overlay first?</p>
          <p className="text-sm text-muted-foreground">
            Start with the LAN-over-internet guide, then come back for RetroArch netplay.
          </p>
        </div>
        <Link
          href="/guides/lan-over-internet"
          className="inline-flex items-center gap-1 text-sm font-bold text-primary"
        >
          LAN guide <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
