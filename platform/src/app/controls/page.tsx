import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Gamepad2, Keyboard, MonitorPlay, MousePointer2, SlidersHorizontal, Layers3 } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { Badge } from "@/components/ui/bits";

export const metadata: Metadata = pageMetadata({
  title: "PlayBound Controls — Controller support built around each game",
  description: "See how PlayBound Controls translates a gamepad into the keyboard and mouse actions a PC game expects, then loads the right profile when you play.",
  path: "/controls",
});

const steps = [
  { icon: Gamepad2, number: "01", title: "Read your controller", text: "PlayBound reads the connected gamepad's buttons and sticks through a common input layer. The game does not need to recognize the controller itself." },
  { icon: Layers3, number: "02", title: "Load the game's profile", text: "A profile maps familiar actions such as Move, Confirm and Accelerate to the inputs that particular game expects. Editions can have different profiles when their controls differ." },
  { icon: Keyboard, number: "03", title: "Send the right input", text: "For a game built around keyboard and mouse, PlayBound sends those commands while you play, then releases them when the game closes. The game files stay untouched." },
] as const;

export default function ControlsPage() {
  return (
    <div className="w-full space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd data={graph(
        { "@type": "WebPage", name: "PlayBound Controls", url: absoluteUrl("/controls"), description: "How PlayBound brings controller input to PC games built for keyboard and mouse.", publisher: { "@id": ORGANIZATION_ID } },
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Controls", path: "/controls" }])
      )} />

      <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/25 via-card to-card p-6 sm:p-10 lg:p-14">
        <Badge tone="brand"><Gamepad2 className="size-3" /> PlayBound Controls</Badge>
        <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">A controller for games that never planned for one.</h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          A great PC game should not become a desk-only game because it expects a keyboard and mouse. PlayBound Controls gives it a controller layout made for its actual controls. Choose it when you press Play; PlayBound handles the translation while the game runs.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/launcher" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-110"><MonitorPlay className="size-4" /> Get the launcher</Link>
          <Link href="/discover" className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-primary/40">Explore games <ArrowRight className="size-4" /></Link>
        </div>
      </header>

      <section aria-labelledby="how-controls-work">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Under the hood</p>
          <h2 id="how-controls-work" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">One input system. A layout for each game.</h2>
          <p className="mt-3 text-muted-foreground">The controller is only the starting point. The profile in the middle is what makes its buttons mean the right thing to the game.</p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {steps.map(({ icon: Icon, number, title, text }) => (
            <div key={number} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between"><Icon className="size-6 text-primary" /><span className="font-mono text-xs text-muted-foreground">{number}</span></div>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <MousePointer2 className="size-6 text-primary" />
          <h2 className="mt-4 text-xl font-extrabold">More than button-to-key shortcuts</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">The left stick can become movement while the right stick moves a pointer. Buttons can take on game actions like Confirm, Back or Attack. Each layout follows what feels natural for that game instead of forcing one universal keyboard map on everything.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <SlidersHorizontal className="size-6 text-primary" />
          <h2 className="mt-4 text-xl font-extrabold">A shared overlay while you play</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Open the PlayBound overlay with Ctrl+P on Windows or ⌘+P on Mac. The Controls tab shows the active layout and its available adjustments; the same overlay holds server tools when you are playing together.</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <h2 className="text-xl font-extrabold">How it fits into a game night</h2>
        <ol className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <li><strong className="block text-foreground">1. Press Play</strong><span className="mt-1 block text-muted-foreground">When a PlayBound layout is available, choose it in the launcher&apos;s input prompt.</span></li>
          <li><strong className="block text-foreground">2. Play with your pad</strong><span className="mt-1 block text-muted-foreground">The game receives the keyboard and mouse input its own controls already understand.</span></li>
          <li><strong className="block text-foreground">3. Quit normally</strong><span className="mt-1 block text-muted-foreground">PlayBound stops translating when the game ends. No game installation changes are needed.</span></li>
        </ol>
        <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">Today, PlayBound Controls translates physical gamepads to keyboard and mouse input on Windows. Games with good native controller support can use their own controls. Layout availability and verification are shown on each game&apos;s page.</p>
      </section>

      <p className="text-center"><Link href="/connect" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Playing with friends? Meet PlayBound Connect <ArrowRight className="size-4" /></Link></p>
    </div>
  );
}
