import Link from "next/link";
import { Check, Gamepad2, Server, SlidersHorizontal, Users } from "lucide-react";
import { BasicSlotPicker } from "./BasicSlotPicker";
import { HostingGameTile } from "./HostingGameTile";
import { HostingRegionMap } from "./HostingRegionMap";
import { mostPopularGames } from "@/lib/catalog";
import { hostingGameArt } from "@/lib/dedicatedHosting/publicGameArt";
import { loadHostingInventory } from "@/lib/dedicatedHosting/inventory";
import { rankedHostingGames } from "@/lib/dedicatedHosting/publicLineup";
import { loadPublicTier, publicGames } from "@/lib/dedicatedHosting/publicTier";
import type { HostingTierKey } from "@/lib/dedicatedHosting/tier";

const FEATURES = [
  "Switch games without buying another plan",
  "Split one slot pool across several games and servers",
  "Keep settings with automatic server-configuration backups",
  "Back up and restore saved worlds for supported games",
  "Manage maps, mods and players from PlayBound",
  "Feature public servers on PlayBound.club with one-click joining",
  "Invite trusted PlayBound members to help manage servers",
  "Bring servers into parties and events",
  "Get help through PlayBound or the dedicated-server Discord room",
];

export async function HostingTierDetails({ tierKey }: { tierKey: HostingTierKey }) {
  const [{ tier, live }, inventory, popular] = await Promise.all([
    loadPublicTier(tierKey), loadHostingInventory(), mostPopularGames(1000).catch(() => []),
  ]);
  const name = tierKey === "basic" ? "Basic" : tierKey === "pro" ? "Pro" : "Extreme";
  const games = rankedHostingGames(publicGames(tier), inventory, popular.map((game) => game.slug));
  const artBySlug = await hostingGameArt(games.map((game) => game.gameSlug));
  const packages = [...tier.packages].filter((pkg) => pkg.enabled !== false).sort((a, b) => a.order - b.order);
  const region = tier.regions.find((entry) => entry.salesEnabled)?.label || "US Central";
  const editions = games.reduce((sum, game) => sum + game.editions.length, 0);

  return <main className="w-full space-y-12 px-4 py-10 sm:px-6 lg:px-8">
    <Link href="/hosting" className="text-sm font-semibold text-primary hover:underline">← All hosting plans</Link>
    <header className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card p-7 sm:p-10">
      <div className="absolute -right-12 -top-12 size-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative max-w-3xl space-y-4">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">PlayBound Dedicated {name}</p>
        <h1 className="text-4xl font-extrabold sm:text-5xl">Your server, your games, your people.</h1>
        <p className="text-lg text-muted-foreground">{tierKey === "basic" ? "Put your slots into one busy server or split them across several. Change games whenever your group does." : `${name} is coming soon. It will include every game from lower plans, plus its own growing lineup.`}</p>
        <p className="text-sm font-semibold">{games.length} games · {editions} additional editions</p>
      </div>
    </header>

    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h2 className="text-2xl font-bold">What’s included</h2>
        <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">{FEATURES.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul>
        <p className="mt-6 text-sm text-muted-foreground">Games without an enforceable player cap use slots to reserve server capacity. Those servers stop after 30 minutes of confirmed inactivity.</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h2 className="text-2xl font-bold">Plan and slots</h2>
        {tierKey === "basic" ? <div className="mt-4"><BasicSlotPicker packages={packages} available={live && tier.salesEnabled} region={region} /></div> : <p className="mt-4 text-sm text-muted-foreground">Pricing and additional capacity will be announced when {name} opens.</p>}
        <Link href="/hosting/servers" className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">Manage my servers →</Link>
      </div>
    </section>

    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h2 className="text-2xl font-bold">Hosting that moves with your group</h2>
        <div className="mt-6 space-y-5">
          <div className="flex gap-3"><Server className="size-5 shrink-0 text-primary" /><p className="text-sm">Run several servers from one plan, move your slots between them, and switch supported games without rebuilding your subscription.</p></div>
          <div className="flex gap-3"><Users className="size-5 shrink-0 text-primary" /><p className="text-sm">Choose public, private or friends-only access. Invite other PlayBound members to help administer your servers.</p></div>
          <div className="flex gap-3"><Gamepad2 className="size-5 shrink-0 text-primary" /><p className="text-sm">Bring a server into a party or event so your group has one place to meet and join.</p></div>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3"><SlidersHorizontal className="size-5 text-primary" /><h2 className="text-2xl font-bold">The in-game overlay</h2></div>
        <p className="mt-4 text-sm text-muted-foreground">Press Ctrl+P on Windows or Linux, or Command+P on Mac, to open PlayBound’s shared overlay while you play. Its Server tab shows the controls your game supports; changes tell you whether they apply live, next round, or after a restart.</p>
        <div className="mt-6 rounded-xl border border-primary/30 bg-background p-4 shadow-inner">
          <div className="flex gap-4 border-b border-border pb-3 text-xs font-semibold"><span>Game</span><span className="text-primary">Server</span><span>Controls</span></div>
          <div className="mt-4 space-y-3 text-sm"><p className="font-semibold">Your server controls</p><p className="text-muted-foreground">Maps, players and game-specific settings in one place.</p><p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">PlayBound shows when a change takes effect.</p></div>
        </div>
      </div>
    </section>

    <section className="space-y-5" id="games">
      <div><h2 className="text-3xl font-bold">All {name} games</h2><p className="mt-1 text-sm text-muted-foreground">{games.length} games and {editions} additional editions included in this plan. Lower-plan games carry into higher plans automatically.</p></div>
      {games.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{games.map((game) => <HostingGameTile key={game.gameSlug} game={game} art={artBySlug[game.gameSlug]} />)}</div> : <p className="rounded-xl border border-border bg-card p-6 text-muted-foreground">The game lineup is being prepared.</p>}
    </section>

    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8"><h2 className="text-2xl font-bold">Where we host</h2><p className="mt-2 text-sm text-muted-foreground">Regions update as PlayBound brings them online.</p><HostingRegionMap regions={tier.regions} /></section>
  </main>;
}
