import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Check, Server } from "lucide-react";
import { GameArt } from "@/components/GameArt";
import { BasicSlotPicker } from "@/components/hosting/BasicSlotPicker";
import { HostingRegionMap } from "@/components/hosting/HostingRegionMap";
import { listGames } from "@/lib/catalog";
import { loadPublicTier, publicGames } from "@/lib/dedicatedHosting/publicTier";
import { PENDING_DEDICATED_GAMES } from "@/lib/dedicatedHosting/pendingGames";
import { hostingGameArt } from "@/lib/dedicatedHosting/publicGameArt";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Game Server Hosting — PlayBound Dedicated",
  description: "Split your hosting slots across games, switch whenever you want, and run your servers through PlayBound.",
  path: "/hosting",
});

const FEATURES = [
  "Switch games without buying another plan",
  "Split your slot pool across several games and servers",
  "Keep your settings with automatic server-configuration backups",
  "Back up and restore saved worlds for supported games",
  "Manage maps, mods and players in the admin panel and PlayBound overlay",
  "Feature public servers on PlayBound.club and offer one-click joining",
  "Invite trusted PlayBound members to help manage your servers",
  "Bring your servers into parties and events",
  "Get PlayBound hosting support",
];
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function HostingPage() {
  const [{ tier, live }, catalog] = await Promise.all([loadPublicTier(), listGames().catch(() => [])]);
  const packages = [...tier.packages].filter((p) => p.enabled !== false).sort((a, b) => a.order - b.order);
  const games = publicGames(tier);
  const editionCount = games.reduce((total, game) => total + new Set(game.editions).size, 0);
  const available = new Set(games.map((g) => g.gameSlug));
  const cards = new Map(catalog.filter((g) => available.has(g.slug)).map((g) => [g.slug, g]));
  const lineup = [...games.map((g) => ({ gameSlug: g.gameSlug, title: g.title, requirement: null as string | null })), ...PENDING_DEDICATED_GAMES].sort((a, b) => a.title.localeCompare(b.title));
  const artBySlug = await hostingGameArt(lineup.map((game) => game.gameSlug));
  const region = tier.regions.find((r) => r.salesEnabled)?.label || "US Central";

  return <main className="w-full space-y-16 px-4 py-10 sm:px-6 lg:px-8">
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
      <div className="absolute inset-0 grid grid-cols-3 sm:grid-cols-4 lg:left-1/3 lg:grid-cols-4" aria-hidden="true">
        {["openra", "mindustry", "supertuxkart", "xonotic", "openttd", "hedgewars", "warzone-2100", "0ad"].map((slug) => <div key={slug} className="relative overflow-hidden"><Image src={`/games/${slug}/cover.webp`} alt="" fill priority={slug === "openra"} sizes="(max-width: 1024px) 33vw, 17vw" className="object-cover" /></div>)}
        <div className="absolute inset-0 bg-card/55 lg:bg-gradient-to-r lg:from-card lg:via-card/70 lg:to-card/20" />
      </div>
      <div className="relative max-w-3xl space-y-5 p-8 sm:p-12 lg:py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">PlayBound Dedicated</p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">Your games deserve a place to play.</h1>
        <p className="text-lg text-muted-foreground">Host the games your people love. Give one game the whole room, or split your plan across several. Switch whenever the night takes a different turn.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="#plans" className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">Explore plans</Link>
          <Link href="/hosting/servers" className="rounded-lg border border-border px-5 py-3 font-semibold">Manage my servers</Link>
        </div>
      </div>
    </section>

    <section id="plans" className="space-y-6">
      <div><h2 className="text-3xl font-bold">Choose how you host</h2><p className="text-muted-foreground">Start with Basic. Pro and Extreme are on the way.</p></div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article id="basic" className="rounded-2xl border border-primary/50 bg-card p-6 lg:row-span-2 lg:p-8">
          <Server className="mb-4 text-primary" /><h3 className="text-2xl font-bold">Basic</h3>
          <p className="mt-2 text-sm text-muted-foreground">Flexible game hosting for your group or community.</p>
          <p className="mt-6 text-3xl font-bold">{packages.length ? `From ${price(Math.min(...packages.map((p) => p.priceCents)))}` : "Flexible pricing"}<span className="text-sm font-normal text-muted-foreground"> / month</span></p>
          <p className="mt-2 text-sm">{games.length} supported games · {editionCount} additional editions · switch games without switching plans</p>
          <ul className="mt-6 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">{FEATURES.map((item) => <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul>
          <div className="mt-7"><BasicSlotPicker packages={packages} available={live && tier.salesEnabled} region={region} /></div>
          <p className="mt-4 text-sm text-muted-foreground">For games without an enforceable player cap, slots reserve server capacity. Those servers stop after 30 minutes of confirmed inactivity.</p>
          <Link href="#all-games" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">See all {games.length} games →</Link>
        </article>
        {(["Pro", "Extreme"] as const).map((name) => <article key={name} className="rounded-2xl border border-border bg-card/70 p-6">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">Coming soon</span>
          <h3 className="mt-5 text-2xl font-bold">{name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">More room for growing communities. Details will follow when this plan is ready.</p>
        </article>)}
      </div>
    </section>

    <section className="rounded-2xl border border-border bg-card p-6 lg:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-bold">Where we host</h2><p className="mt-2 text-sm text-muted-foreground">Available hosting regions appear on this map as they come online. Choose the region closest to your players when you subscribe.</p></div><Link href="/hosting/servers" className="text-sm font-semibold text-primary hover:underline">Manage your servers →</Link></div><HostingRegionMap regions={tier.regions} /></section>

    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6"><div><h2 className="text-xl font-bold">Need a hand with your server?</h2><p className="mt-1 text-sm text-muted-foreground">Open a support request in PlayBound or join the dedicated-server support room on Discord.</p></div><div className="flex flex-wrap gap-3"><Link href="/hosting/servers" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary">PlayBound support</Link><a href="/api/hosting/support/discord" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Discord support ↗</a></div></section>

    <section id="all-games" className="space-y-5"><div><h2 className="text-2xl font-bold">Every game on Basic</h2><p className="text-sm text-muted-foreground">{games.length} supported games and {editionCount} additional editions. Pick one for the whole night or divide your slots across several.</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{lineup.map((g) => {
        const art = artBySlug[g.gameSlug] || cards.get(g.gameSlug);
        const content = <><div className="relative aspect-[16/10] overflow-hidden bg-secondary">{art ? <GameArt game={{ ...art, title: g.title }} showTitle={false} iconSize="sm" className="size-full" /> : <div className="flex size-full items-center justify-center"><Server className="h-8 w-8 text-primary/60" /></div>}</div><div className="p-3"><h3 className="line-clamp-2 text-sm font-semibold leading-snug">{g.title}</h3>{g.requirement ? <><span className="mt-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-xs">Planned</span><p className="mt-1 text-xs text-muted-foreground">{g.requirement}</p></> : null}</div></>;
        return g.requirement ? <article key={g.gameSlug} className="overflow-hidden rounded-xl border border-border bg-card">{content}</article> : <Link key={g.gameSlug} href={`/hosting/${g.gameSlug}`} className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50">{content}</Link>;
      })}</div><p className="text-xs text-muted-foreground">Planned games cannot be selected or started yet.</p></section>
  </main>;
}
