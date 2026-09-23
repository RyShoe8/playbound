import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Gamepad2, Keyboard, MonitorPlay, MousePointer2, SlidersHorizontal } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { Badge } from "@/components/ui/bits";
import { listPublicControlProfiles } from "@/lib/controlProfiles/service";

export const metadata: Metadata = pageMetadata({
  title: "PlayBound Controls — Make Keyboard Games Feel at Home on a Controller",
  description: "PlayBound Controls gives games without native gamepad support a controller layout that starts with the game and ends when you quit. See which games are ready and which are being tuned.",
  path: "/controls",
});

export default async function ControlsPage() {
  const profiles = await listPublicControlProfiles();
  const ready = profiles.filter((profile) => profile.status === "verified");
  const testing = profiles.filter((profile) => profile.status === "testing");

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd data={graph(
        { "@type": "WebPage", name: "PlayBound Controls", url: absoluteUrl("/controls"), description: "Controller layouts for PC games that were made for keyboard and mouse.", publisher: { "@id": ORGANIZATION_ID } },
        breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Controls", path: "/controls" }])
      )} />

      <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/25 via-card to-card p-6 sm:p-10">
        <Badge tone="brand"><Gamepad2 className="size-3" /> PlayBound Controls</Badge>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight">
          Your controller belongs in more games.
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Some great PC games only listen to a keyboard and mouse. PlayBound Controls gives them a gamepad layout: move with a stick, press a button for the game&apos;s own keys, and use the other stick as a pointer when the game needs one.
        </p>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Choose PlayBound Controls when you press Play. The launcher loads that game&apos;s layout, sends its keyboard and mouse commands while you play, and releases them when you quit. Your game files stay untouched.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/launcher" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-110">
            <MonitorPlay className="size-4" /> Get the launcher
          </Link>
          <Link href="/discover" className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-primary/40">
            <Gamepad2 className="size-4" /> Explore games
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Gamepad2, title: "Your controller", text: "Use a connected gamepad. PlayBound reads its buttons and sticks so each supported game gets one clear layout." },
          { icon: Keyboard, title: "The game's own controls", text: "A game profile translates those inputs into the keyboard and mouse commands that game already understands." },
          { icon: SlidersHorizontal, title: "One in-game overlay", text: "Press Ctrl+P on Windows to see the active layout and tune pointer sensitivity. Server tools live there too." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-border bg-card p-5">
            <Icon className="size-5 text-primary" />
            <h2 className="mt-3 text-base font-bold">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2"><Gamepad2 className="size-5 text-primary" /><h2 className="text-lg font-extrabold">Ready to play</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">These layouts have been tried with a physical controller. Select PlayBound Controls in the launcher&apos;s input-choice popup.</p>
        {ready.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{ready.map((profile) => (
          <li key={profile.gameSlug}><Link href={`/games/${profile.gameSlug}/controls`} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4 text-sm font-semibold hover:border-primary/40">
            {profile.title}<ArrowRight className="size-4 text-primary" />
          </Link></li>
        ))}</ul> : <p className="mt-4 text-sm text-muted-foreground">Verified game layouts will appear here as they finish play testing.</p>}
      </section>

      {testing.length > 0 && <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2"><MousePointer2 className="size-5 text-primary" /><h2 className="text-lg font-extrabold">On the test bench</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">We have keyboard-to-controller recipes for these games. Choose <strong>PlayBound Controls Preview</strong> when launching one to try its layout. The mapping may need tuning; we&apos;ll mark it ready after a hands-on play test.</p>
        <ul className="mt-4 flex flex-wrap gap-2">{testing.map((profile) => (
          <li key={profile.gameSlug}><Link href={`/games/${profile.gameSlug}/controls`} className="inline-flex rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-semibold hover:border-primary/40">{profile.title}</Link></li>
        ))}</ul>
      </section>}

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-extrabold">What works today</h2>
        <p className="mt-2 text-sm text-muted-foreground">PlayBound Controls currently runs on Windows and translates a physical controller into keyboard and mouse input. A game with native controller support can keep using its own controls. Layouts are specific to each game, and an edition can have its own layout when its controls differ.</p>
        <p className="mt-3 text-sm text-muted-foreground">While a game is running, press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl+P</kbd> to open the shared overlay. The Controls tab shows the active bindings; the Server tab manages your party when you are playing together.</p>
      </section>

      <p className="text-center"><Link href="/connect" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Playing with friends? Meet PlayBound Connect <ArrowRight className="size-4" /></Link></p>
    </div>
  );
}
