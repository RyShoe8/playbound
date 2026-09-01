import Link from "next/link";
import { BookOpen, Wifi, Gamepad2, Users, ArrowRight, ShieldCheck, Download } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/bits";
import {
  JsonLd,
  graph,
  breadcrumbSchema,
  ORGANIZATION_ID,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "PC Gaming Guides, Networking & Setup Tutorials",
  description:
    "Clear, practical guides for PC gaming: playing LAN games over the internet without port forwarding, using your phone as a touchscreen gamepad, and party setup.",
  path: "/guides",
});

const featuredGuides = [
  {
    slug: "lan-over-internet",
    title: "How to Play LAN Games Over the Internet",
    subtitle: "Hamachi & Radmin VPN Alternative (CGNAT-Safe)",
    description:
      "A complete guide to bridging local multiplayer games online through CGNAT and router firewalls without port forwarding. Explains how modern virtual networking and PlayBound Connect solve local LAN connectivity automatically.",
    icon: Wifi,
    badge: "Multiplayer Networking",
  },
  {
    slug: "phone-as-controller",
    title: "How to Use Your Phone as a PC Game Controller",
    subtitle: "Free Couch Mode Gamepad via QR Code",
    description:
      "Turn any iPhone or Android phone into an instant touchscreen gamepad for party and couch co-op games. No apps, drivers, or Bluetooth pairing required — just scan a QR code on your screen.",
    icon: Gamepad2,
    badge: "Hardware & Gamepads",
  },
];

export default function GuidesIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "PC Gaming Guides & Tutorials",
            description:
              "Clear, practical guides for PC gaming: playing LAN games over the internet without port forwarding, using your phone as a touchscreen gamepad, and party setup.",
            url: absoluteUrl("/guides"),
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            numberOfItems: featuredGuides.length,
            itemListElement: featuredGuides.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: g.title,
              url: absoluteUrl(`/guides/${g.slug}`),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
          ])
        )}
      />

      {/* Header */}
      <div className="max-w-2xl">
        <Badge tone="brand">
          <BookOpen className="size-3.5" /> Guides & Tutorials
        </Badge>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          PC Gaming Guides
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Practical, straightforward solutions to common PC gaming friction: bypassing port
          forwarding hurdles, setting up phone gamepads, and jumping into multiplayer with friends.
        </p>
      </div>

      {/* Featured Guides Grid */}
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {featuredGuides.map((guide) => {
          const Icon = guide.icon;
          return (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="size-5" />
                  </span>
                  <Badge tone="neutral" className="text-[10px]">
                    {guide.badge}
                  </Badge>
                </div>
                <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                  {guide.title}
                </h2>
                <p className="mt-1 text-xs font-semibold text-primary/90">{guide.subtitle}</p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {guide.description}
                </p>
              </div>

              <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-primary group-hover:translate-x-0.5 transition-transform border-t border-border/60 pt-4">
                Read Full Guide <ArrowRight className="size-3" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Additional Resource Hubs */}
      <div className="mt-12 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold tracking-tight">More Gaming & Setup Resources</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Looking for specific game guides, server browser lists, or community recommendations?
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/play-with-friends"
            className="flex items-center justify-between rounded-xl border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <span className="text-xs font-bold">50+ Game Guides</span>
            </div>
            <ArrowRight className="size-3 text-muted-foreground" />
          </Link>
          <Link
            href="/standards"
            className="flex items-center justify-between rounded-xl border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-400" />
              <span className="text-xs font-bold">The PlayBound Bar</span>
            </div>
            <ArrowRight className="size-3 text-muted-foreground" />
          </Link>
          <Link
            href="/launcher"
            className="flex items-center justify-between rounded-xl border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Download className="size-4 text-play" />
              <span className="text-xs font-bold">PlayBound Client</span>
            </div>
            <ArrowRight className="size-3 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </div>
  );
}
