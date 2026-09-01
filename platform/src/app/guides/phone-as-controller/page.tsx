import Link from "next/link";
import { Gamepad2, QrCode, Smartphone, ArrowRight, Zap } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import {
  JsonLd,
  graph,
  faqSchema,
  breadcrumbSchema,
  ORGANIZATION_ID,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "How to Use Your Phone as a PC Game Controller (Free Couch Mode)",
  description:
    "Turn any iPhone or Android phone into a touchscreen gamepad for PC gaming. No drivers, apps, or Bluetooth pairing required — just scan a QR code.",
  path: "/guides/phone-as-controller",
});

const faq = [
  {
    q: "Do I need to install an app on my phone to use it as a PC controller?",
    a: "No. PlayBound Couch Mode runs entirely inside your mobile web browser (Safari, Chrome, Firefox). When you scan the QR code displayed on your PC screen, it opens an ultra-low-latency virtual gamepad web interface immediately.",
  },
  {
    q: "Does my phone need to be on the same Wi-Fi network as my PC?",
    a: "Yes. Couch Mode sends input events over your local home network directly between your phone and your PC, which ensures near-zero latency (typically under 10ms) without sending controller inputs over the public internet.",
  },
  {
    q: "Can multiple friends connect their phones at the same time?",
    a: "Yes! Up to 4 phones can connect simultaneously, each assigned as a distinct gamepad (Player 1, Player 2, Player 3, Player 4). This makes it perfect for game nights and party games when you don't have enough physical controllers.",
  },
  {
    q: "Does Couch Mode work with both iPhone (iOS) and Android?",
    a: "Yes. Any smartphone with a modern web browser and touchscreen supports Couch Mode, including iOS (Safari, Chrome) and Android devices.",
  },
  {
    q: "How does my PC recognize the phone inputs?",
    a: "The PlayBound desktop client registers standard virtual gamepad devices (XInput or DirectInput emulation) on Windows and Linux, so your games recognize the phone as an authentic gamepad just like an Xbox or PlayStation controller.",
  },
];

const howToSteps = [
  {
    name: "Open PlayBound on Your PC",
    text: "Launch the PlayBound desktop client and navigate to any game that supports local multiplayer or controller input.",
    url: absoluteUrl("/launcher"),
  },
  {
    name: "Activate Couch Mode",
    text: "Click the 'Couch Mode' gamepad icon in the PlayBound launcher or in-game overlay. A unique pairing QR code will appear.",
  },
  {
    name: "Scan the QR Code With Your Phone",
    text: "Open your phone's camera app and scan the on-screen QR code. Tap the link to open the controller interface in your mobile browser.",
  },
  {
    name: "Play Immediately",
    text: "Your phone screen transforms into a responsive touchscreen controller with a D-pad, thumbstick, and action buttons. The game detects your phone as Player 1 or an extra controller automatically.",
  },
];

export default function PhoneAsControllerGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "Article",
            headline: "How to Use Your Phone as a PC Game Controller (Free Couch Mode)",
            description:
              "Turn any iPhone or Android phone into a touchscreen gamepad for PC gaming. No drivers, apps, or Bluetooth pairing required — just scan a QR code.",
            url: absoluteUrl("/guides/phone-as-controller"),
            author: { "@id": ORGANIZATION_ID },
            publisher: { "@id": ORGANIZATION_ID },
            isAccessibleForFree: true,
          },
          faqSchema(faq),
          {
            "@type": "HowTo",
            name: "How to Use Your Phone as a PC Gamepad with PlayBound Couch Mode",
            description: "Step-by-step guide to connecting your phone as an extra PC game controller.",
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
            { name: "Guides", path: "/guides/phone-as-controller" },
            { name: "Phone as Controller", path: "/guides/phone-as-controller" },
          ])
        )}
      />

      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Gamepad2 className="size-4" /> Evergreen Hardware & Play Guide
      </div>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
        How to Use Your Phone as a PC Game Controller
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
        Never let a missing gamepad cancel game night. Turn any smartphone into an instant touchscreen
        controller with zero app downloads, driver installations, or Bluetooth pairing.
      </p>

      {/* Short Answer / Quotable Verdict Box */}
      <div className="mt-8 rounded-2xl border-l-4 border-primary bg-card p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary">Short Answer</h2>
        <p className="mt-2 text-lg font-medium leading-relaxed">
          You can use an iPhone or Android phone as a PC gamepad using{" "}
          <strong>PlayBound Couch Mode</strong>. By scanning an on-screen pairing QR code from the PC
          launcher, the phone opens a low-latency WebSockets web controller interface. The PC detects
          the phone as a virtual XInput gamepad, enabling up to 4 players to participate in party and
          couch co-op games without extra hardware.
        </p>
      </div>

      {/* How It Works */}
      <section className="mt-12 space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Why Couch Mode Beats Traditional Mobile Gamepad Apps</h2>
        <p className="leading-relaxed text-muted-foreground">
          Most mobile controller apps on Google Play or the iOS App Store are cumbersome: they require
          installing proprietary server software on your PC, granting administrator permissions,
          configuring firewall ports, or dealing with unreliable Bluetooth pairing.
        </p>
        <p className="leading-relaxed text-muted-foreground">
          PlayBound Couch Mode is built directly into the client. It hosts a lightweight, local-only
          web socket server on your machine. When guests scan the QR code on your monitor, their mobile
          browser loads the touch interface instantly. Inputs stay on your local home Wi-Fi for
          sub-10ms response times.
        </p>

        <div className="grid gap-4 sm:grid-cols-3 mt-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <QrCode className="size-4" /> Instant QR Pairing
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              No account creation or passwords. Friends just point their camera at your PC monitor to
              join.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <Smartphone className="size-4" /> No App Download
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Runs in Safari, Chrome, and Firefox on iOS and Android. Saves phone storage and setup
              time.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <Zap className="size-4" /> Up to 4 Controllers
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Assigns Player 1 through Player 4 automatically. Mix and match physical Xbox controllers
              and phone touchpads.
            </p>
          </div>
        </div>
      </section>

      {/* Step-by-Step Setup Guide */}
      <section className="mt-12 space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Step-by-Step Setup Guide</h2>
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

      {/* Best Games for Couch Mode */}
      <section className="mt-12 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold">Best Party Games for Couch Mode Phone Controllers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Jump straight into these top party brawlers, arcade racers, and sports titles that play
          great with phone touchpads:
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href="/games/mrboom"
            className="flex items-center justify-between rounded-lg border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <span className="font-semibold text-sm">Mr. Boom (Bomberman Clone · Up to 8 Players)</span>
            <ArrowRight className="size-4 text-primary" />
          </Link>
          <Link
            href="/games/supertuxkart"
            className="flex items-center justify-between rounded-lg border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <span className="font-semibold text-sm">SuperTuxKart (Arcade Split-Screen Kart Racing)</span>
            <ArrowRight className="size-4 text-primary" />
          </Link>
          <Link
            href="/games/hedgewars"
            className="flex items-center justify-between rounded-lg border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <span className="font-semibold text-sm">Hedgewars (Turn-Based Artillery Battle)</span>
            <ArrowRight className="size-4 text-primary" />
          </Link>
          <Link
            href="/games/ysoccer"
            className="flex items-center justify-between rounded-lg border border-border/80 bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
          >
            <span className="font-semibold text-sm">YSoccer (Sensible World of Soccer Tribute)</span>
            <ArrowRight className="size-4 text-primary" />
          </Link>
        </div>
        <div className="mt-4 text-right">
          <Link
            href="/collections/best-party-games"
            className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
          >
            View all party games in collections <ArrowRight className="size-3" />
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
