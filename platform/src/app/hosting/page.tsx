import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Check, Server } from "lucide-react";
import { BasicSlotPicker } from "@/components/hosting/BasicSlotPicker";
import { HostingGameTile } from "@/components/hosting/HostingGameTile";
import { HostingRegionMap } from "@/components/hosting/HostingRegionMap";
import { mostPopularGames } from "@/lib/catalog";
import { loadPublicTier, publicGames } from "@/lib/dedicatedHosting/publicTier";
import { hostingGameArt } from "@/lib/dedicatedHosting/publicGameArt";
import { loadHostingInventory } from "@/lib/dedicatedHosting/inventory";
import { rankedHostingGames } from "@/lib/dedicatedHosting/publicLineup";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Game Server Hosting — PlayBound Dedicated",
  description: "Split your hosting slots across games, switch whenever you want, and run your servers through PlayBound.",
  path: "/hosting",
});

const BASIC_FEATURES = [
  "Switch games whenever you want",
  "Split slots across several servers",
  "Back up and restore supported worlds",
  "Manage maps and players from PlayBound",
  "List public servers on PlayBound.club",
];
const PLAN_NAMES = ["Basic", "Pro", "Extreme"] as const;

export default async function HostingPage() {
  const [[basic, pro, extreme], inventory, popular] = await Promise.all([
    Promise.all([loadPublicTier("basic"), loadPublicTier("pro"), loadPublicTier("extreme")]),
    loadHostingInventory(),
    mostPopularGames(1000).catch(() => []),
  ]);
  const tiers = [basic, pro, extreme];
  const popularSlugs = popular.map((game) => game.slug);
  const ranked = tiers.map(({ tier }) => rankedHostingGames(publicGames(tier), inventory, popularSlugs));
  const artBySlug = await hostingGameArt([...new Set(ranked.flatMap((games) => games.slice(0, 10).map((game) => game.gameSlug)))]);
  const packages = [...basic.tier.packages].filter((pkg) => pkg.enabled !== false).sort((a, b) => a.order - b.order);
  const salesRegion = basic.tier.regions.find((r) => r.salesEnabled);
  const region = salesRegion?.label || "US Central";

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
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        {PLAN_NAMES.map((name, index) => {
          const games = ranked[index];
          const comingSoon = index > 0;
          return <article key={name} className={`flex min-w-0 flex-col rounded-2xl border bg-card p-5 sm:p-6 ${index === 0 ? "border-primary/50" : "border-border"}`}>
            <div className="min-h-44">
              {comingSoon ? <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">Coming soon</span> : <Server className="mb-4 text-primary" />}
              <h3 className="mt-3 text-2xl font-bold">{name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{comingSoon ? "More room for growing communities, with every game from the plans below it." : "Flexible game hosting for your group or community."}</p>
              <p className="mt-4 text-sm font-semibold">{games.length} {games.length === 1 ? "game" : "games"} · {games.reduce((sum, game) => sum + game.editions.length, 0)} additional editions</p>
            </div>
            {index === 0 ? <>
              <ul className="space-y-2 text-sm">{BASIC_FEATURES.map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul>
              <div className="mt-5"><BasicSlotPicker packages={packages} available={basic.live && basic.tier.salesEnabled} region={region} regionKey={salesRegion?.key || ""} /></div>
            </> : <p className="text-sm text-muted-foreground">Pricing and additional features will be announced before this plan opens.</p>}
            <div className="mt-7 flex-1 space-y-2">
              <h4 className="text-sm font-bold">{games.length ? "Popular games" : "Games coming soon"}</h4>
              {games.slice(0, 10).map((game) => <HostingGameTile key={game.gameSlug} game={game} art={artBySlug[game.gameSlug]} compact />)}
            </div>
            <Link href={`/hosting/${name.toLowerCase()}`} className="mt-6 inline-flex justify-center rounded-lg border border-primary/40 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10">See all games and plan details →</Link>
          </article>;
        })}
      </div>
    </section>

    <section className="rounded-2xl border border-border bg-card p-6 lg:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-bold">Where we host</h2><p className="mt-2 text-sm text-muted-foreground">Available hosting regions appear on this map as they come online. Choose the region closest to your players when you subscribe.</p></div><Link href="/hosting/servers" className="text-sm font-semibold text-primary hover:underline">Manage your servers →</Link></div><HostingRegionMap regions={basic.tier.regions} /></section>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6"><div><h2 className="text-xl font-bold">Need a hand with your server?</h2><p className="mt-1 text-sm text-muted-foreground">Open a support request in PlayBound or join the dedicated-server support room on Discord.</p></div><div className="flex flex-wrap gap-3"><Link href="/hosting/servers" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary">PlayBound support</Link><a href="/api/hosting/support/discord" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Discord support ↗</a></div></section>
  </main>;
}
