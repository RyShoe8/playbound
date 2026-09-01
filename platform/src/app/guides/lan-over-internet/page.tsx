import Link from "next/link";
import { Wifi, ArrowRight, Sparkles } from "lucide-react";
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
  title: "How to Play LAN Games Over the Internet (No Port Forwarding, Hamachi Alternative)",
  description:
    "How to play local LAN multiplayer games online with remote friends. Bypass CGNAT, strict router firewalls, and port forwarding hurdles with modern virtual LAN.",
  path: "/guides/lan-over-internet",
});

const faq = [
  {
    q: "Why can't my friend connect to my LAN game over the internet?",
    a: "Local multiplayer games look for other devices on the same local subnet (like 192.168.1.x) using broadcast packets. When played over the public internet, home routers and ISP NAT firewalls block those broadcasts unless the players share an encrypted virtual local network.",
  },
  {
    q: "What is CGNAT, and why does it prevent port forwarding?",
    a: "Carrier-Grade NAT (CGNAT) means your internet service provider places multiple customers behind a single shared public IP address. Because you don't have a unique public IPv4 address, standard router port forwarding cannot route incoming traffic to your PC.",
  },
  {
    q: "How does PlayBound Connect bypass port forwarding?",
    a: "PlayBound Connect solves this automatically. It uses lightweight peer-to-peer virtual networking tunnels under the hood. When you launch a LAN-only game from a PlayBound party, Connect automatically negotiates a direct encrypted tunnel between your computers, bridging local network broadcasts without router port forwarding or manual IP setup.",
  },
  {
    q: "Is PlayBound Connect free?",
    a: "Yes. Virtual LAN bridging, party voice integration, and peer-to-peer multiplayer connectivity are 100% free and built into the PlayBound desktop client.",
  },
  {
    q: "Which games work over PlayBound virtual LAN?",
    a: "Any PC game with a LAN or direct-IP multiplayer mode, including classic RTS games (OpenRA, Warzone 2100), retro arena shooters (Xonotic, OpenArena), racing games (SuperTuxKart), and simulation games (OpenTTD).",
  },
];

const howToSteps = [
  {
    name: "Install the PlayBound Launcher",
    text: "Download and launch the free PlayBound client on both your computer and your friend's computer.",
    url: absoluteUrl("/launcher"),
  },
  {
    name: "Create a Party",
    text: "Open the Party panel in PlayBound, invite your friends with a link or username, and select the game you want to play.",
  },
  {
    name: "Enable Virtual LAN",
    text: "When launching a LAN-only game, PlayBound Connect automatically assigns each party member a private virtual IP and bridges local network broadcasts.",
  },
  {
    name: "Host and Join In-Game",
    text: "One player clicks 'Host LAN Game' inside the game; friends will see the host appear in their local multiplayer server list, or can paste the host's 1-click Connect IP.",
  },
];

export default function LanOverInternetGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "Article",
            headline: "How to Play LAN Games Over the Internet Without Port Forwarding",
            description:
              "How to play local LAN multiplayer games online with remote friends through CGNAT without port forwarding or complicated VPN configs.",
            url: absoluteUrl("/guides/lan-over-internet"),
            author: { "@id": ORGANIZATION_ID },
            publisher: { "@id": ORGANIZATION_ID },
            isAccessibleForFree: true,
          },
          faqSchema(faq),
          {
            "@type": "HowTo",
            name: "How to Play LAN Games Over the Internet With PlayBound Connect",
            description: "Step-by-step guide to connecting with friends for LAN-only PC games.",
            step: howToSteps.map((s, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              name: s.name,
              text: s.text,
              ...(s.url ? { url: s.url } : {}),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides/lan-over-internet" },
            { name: "LAN Over Internet", path: "/guides/lan-over-internet" },
          ])
        )}
      />

      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Wifi className="size-4" /> Evergreen Multiplayer Guide
      </div>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
        How to Play LAN Games Over the Internet
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
        The definitive guide to playing local-only multiplayer PC games with remote friends. No
        router configuration, no port forwarding headaches, and no expired Hamachi rooms.
      </p>

      {/* Short Answer / Quotable Verdict Box */}
      <div className="mt-8 rounded-2xl border-l-4 border-primary bg-card p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary">Short Answer</h2>
        <p className="mt-2 text-lg font-medium leading-relaxed">
          To play LAN-only games over the internet, players must share a private encrypted virtual
          network tunnel. Modern tools like{" "}
          <Link href="/connect" className="text-primary underline">
            PlayBound Connect
          </Link>{" "}
          bypass CGNAT and router port forwarding by establishing peer-to-peer encrypted tunnels
          automatically, allowing in-game LAN server browsers to discover remote hosts seamlessly.
        </p>
      </div>

      {/* Automatic Solution Notice */}
      <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-card to-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Badge tone="play">
            <Sparkles className="size-3" /> Solved Automatically
          </Badge>
          <span className="text-xs font-semibold text-emerald-400">Zero manual network setup</span>
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          PlayBound Connect Solves This Automatically
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          You don&apos;t have to manually configure virtual LAN tunnels, install virtual TAP network
          adapters, or configure router port forwarding. When you form a party in PlayBound and launch
          any supported LAN-only title, <strong>PlayBound Connect solves this automatically</strong>:
          it negotiates peer-to-peer NAT traversal, creates encrypted virtual tunnels, and mirrors
          broadcast packets behind the scenes. All you and your friends do is click &ldquo;Launch.&rdquo;
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/launcher"
            className="inline-flex items-center gap-1.5 rounded-full bg-play px-4 py-2 text-xs font-bold text-play-foreground transition-all hover:brightness-110"
          >
            Get PlayBound Launcher
          </Link>
          <Link
            href="/play-with-friends"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            Browse 50+ supported multiplayer games <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* The Problem */}
      <section className="mt-12 space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">
          Why Local LAN Games Fail Over the Internet
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          Classic PC games designed for local multiplayer rely on UDP broadcast packets. When you
          click &ldquo;Host Game&rdquo; in an older game, the computer sends packets to the local subnet
          address (e.g. <code className="rounded bg-muted px-1.5 py-0.5 text-xs">192.168.1.255</code>
          ), announcing that a server is ready.
        </p>
        <p className="leading-relaxed text-muted-foreground">
          On the public internet, commercial routers intentionally block these broadcast packets to
          prevent internet-wide flooding. Furthermore, most modern residential ISPs use{" "}
          <strong>Carrier-Grade NAT (CGNAT)</strong>, where hundreds of households share one public
          IP address. If you are behind CGNAT, traditional router port forwarding cannot route
          incoming packets to your machine.
        </p>
      </section>

      {/* Comparison Table */}
      <section className="mt-12 space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">The Modern Alternative to Legacy VPNs</h2>
        <p className="leading-relaxed text-muted-foreground">
          For years, gamers turned to third-party tools like Hamachi or Radmin VPN. While they proved
          the concept, they come with substantial drawbacks today:
        </p>

        <div className="overflow-x-auto rounded-xl border border-border mt-4">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">Feature</th>
                <th className="p-3">LogMeIn Hamachi</th>
                <th className="p-3">Radmin VPN</th>
                <th className="p-3 text-primary">PlayBound Connect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs sm:text-sm">
              <tr>
                <td className="p-3 font-semibold">User Limit</td>
                <td className="p-3 text-amber-500">Max 5 per room (free tier)</td>
                <td className="p-3">Unlimited</td>
                <td className="p-3 font-bold text-emerald-400">Unlimited in Party</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Port Forwarding Needed</td>
                <td className="p-3">No</td>
                <td className="p-3">No</td>
                <td className="p-3 font-bold text-emerald-400">No (CGNAT-Safe)</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Virtual Network Driver</td>
                <td className="p-3 text-amber-500">Kernel TAP driver required</td>
                <td className="p-3 text-amber-500">Kernel driver required</td>
                <td className="p-3 font-bold text-emerald-400">Userspace Peer-to-Peer</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold">Built-in Game Launcher</td>
                <td className="p-3 text-muted-foreground">None</td>
                <td className="p-3 text-muted-foreground">None</td>
                <td className="p-3 font-bold text-emerald-400">1-Click Party Launch</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Step-by-Step Guide */}
      <section className="mt-12 space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">How to Set Up Virtual LAN on PlayBound</h2>
        <div className="space-y-4">
          {howToSteps.map((step, idx) => (
            <div
              key={step.name}
              className="flex gap-4 rounded-xl border border-border bg-card p-5 transition-all"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-sm">
                {idx + 1}
              </div>
              <div>
                <h3 className="text-base font-bold">{step.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recommended LAN Games */}
      <section className="mt-12 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold">Great LAN Games Ready to Play Tonight</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Explore dedicated step-by-step multiplayer guides for top titles supported by PlayBound
          Connect:
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href="/play-with-friends/openra"
            className="flex items-center justify-between rounded-lg border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <span className="font-semibold text-sm">OpenRA (Command & Conquer)</span>
            <ArrowRight className="size-4 text-primary" />
          </Link>
          <Link
            href="/play-with-friends/xonotic"
            className="flex items-center justify-between rounded-lg border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <span className="font-semibold text-sm">Xonotic (Arena FPS)</span>
            <ArrowRight className="size-4 text-primary" />
          </Link>
          <Link
            href="/play-with-friends/supertuxkart"
            className="flex items-center justify-between rounded-lg border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <span className="font-semibold text-sm">SuperTuxKart (Arcade Racing)</span>
            <ArrowRight className="size-4 text-primary" />
          </Link>
          <Link
            href="/play-with-friends/openttd"
            className="flex items-center justify-between rounded-lg border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <span className="font-semibold text-sm">OpenTTD (Transport Tycoon)</span>
            <ArrowRight className="size-4 text-primary" />
          </Link>
        </div>
        <div className="mt-4 text-right">
          <Link
            href="/play-with-friends"
            className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
          >
            View all 50+ multiplayer guides <ArrowRight className="size-3" />
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold tracking-tight">Frequently Asked Questions</h2>
        <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
          {faq.map((item) => (
            <div key={item.q} className="p-5">
              <h3 className="font-semibold text-base">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
