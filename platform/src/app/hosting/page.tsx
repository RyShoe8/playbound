import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Check, Server } from "lucide-react";
import { GameCard } from "@/components/GameCard";
import { HostingRegionMap } from "@/components/hosting/HostingRegionMap";
import { listGames } from "@/lib/catalog";
import { toDiscoverListingGame } from "@/lib/discoverListing";
import { loadPublicTier, publicGames } from "@/lib/dedicatedHosting/publicTier";
import { PENDING_DEDICATED_GAMES } from "@/lib/dedicatedHosting/pendingGames";
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
const FEATURED = ["openra", "openhv", "mindustry", "supertuxkart", "terraria", "openttd", "xonotic", "factorio", "hedgewars", "warzone-2100"];
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function combos(slots: number, min: number, step: number): string[] {
  const valid = (n: number) => n >= min && n % step === 0;
  const out = [`1 × ${slots}-player server`];
  if (valid(slots / 2)) out.push(`2 × ${slots / 2}-player servers`);
  else if (valid(slots - min) && slots - min !== min) out.push(`1 × ${slots - min} + 1 × ${min}-player servers`);
  if (slots >= min * 2 && valid(min)) out.push(`${Math.floor(slots / min)} × ${min}-player servers`);
  return [...new Set(out)];
}

export default async function HostingPage() {
  const [{ tier, live }, catalog] = await Promise.all([loadPublicTier(), listGames().catch(() => [])]);
  const packages = [...tier.packages].filter((p) => p.enabled !== false).sort((a, b) => a.order - b.order);
  const games = publicGames(tier);
  const available = new Set(games.map((g) => g.gameSlug));
  const cards = new Map(catalog.filter((g) => available.has(g.slug)).map((g) => [g.slug, g]));
  const featured = [
    ...FEATURED.map((slug) => cards.get(slug)).filter((g) => g != null),
    ...catalog.filter((g) => available.has(g.slug) && !FEATURED.includes(g.slug)),
  ].slice(0, 10);
  const lineup = [...games.map((g) => ({ gameSlug: g.gameSlug, title: g.title, requirement: null as string | null })), ...PENDING_DEDICATED_GAMES].sort((a, b) => a.title.localeCompare(b.title));
  const region = tier.regions.find((r) => r.salesEnabled)?.label || "US Central";

  return <main className="w-full space-y-16 px-4 py-10 sm:px-6 lg:px-8">
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
      <div className="absolute inset-y-0 right-0 hidden w-1/2 lg:block">
        <Image src="/games/xonotic/cover.webp" alt="Xonotic game art" fill priority sizes="50vw" className="object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/50 to-transparent" />
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
      <div className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-2xl border border-primary/50 bg-card p-6">
          <Server className="mb-4 text-primary" /><h3 className="text-2xl font-bold">Basic</h3>
          <p className="mt-2 text-sm text-muted-foreground">Flexible game hosting for your group or community.</p>
          <p className="mt-6 text-3xl font-bold">{packages.length ? `From ${price(Math.min(...packages.map((p) => p.priceCents)))}` : "Flexible pricing"}<span className="text-sm font-normal text-muted-foreground"> / month</span></p>
          <p className="mt-2 text-sm">{games.length} supported games</p>
          <Link href="#basic" className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">See what is included →</Link>
        </article>
        {(["Pro", "Extreme"] as const).map((name) => <article key={name} className="rounded-2xl border border-border bg-card/70 p-6">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">Coming soon</span>
          <h3 className="mt-5 text-2xl font-bold">{name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">More room for growing communities. Details will follow when this plan is ready.</p>
        </article>)}
      </div>
    </section>

    <section id="basic" className="grid gap-8 rounded-2xl border border-border bg-card p-6 lg:grid-cols-2 lg:p-8">
      <div><h2 className="text-3xl font-bold">Everything in Basic</h2><p className="mt-2 text-muted-foreground">One plan follows the games you actually play.</p>
        <ul className="mt-6 space-y-3 text-sm">{FEATURES.map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul>
      </div>
      <div className="relative min-h-72 overflow-hidden rounded-xl">
        <Image src="/games/mindustry/cover.webp" alt="Mindustry game art" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <p className="absolute bottom-5 left-5 right-5 text-lg font-semibold text-white">Build a world together. Keep it running your way.</p>
      </div>
    </section>

    <section className="space-y-5"><div><h2 className="text-2xl font-bold">Pick your slots</h2><p className="text-sm text-muted-foreground">A slot is a player seat for games with a server-enforced limit. Stopped servers use none. Hosted in {region}; billed monthly with no setup fee.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{packages.map((p) => <article key={p.slots} className="flex flex-col rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between"><h3 className="text-xl font-bold">{p.slots} slots</h3><p className="text-lg font-semibold">{price(p.priceCents)}<span className="text-sm font-normal text-muted-foreground">/month</span></p></div>
        <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground">{combos(p.slots, tier.minAllocation || 4, tier.allocationIncrement || 4).map((c) => <li key={c}>{c}</li>)}<li>or any combination</li></ul>
        <span className="mt-4 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-medium text-muted-foreground">{live && tier.salesEnabled ? "Checkout opening soon" : "Early access — coming soon"}</span>
      </article>)}</div>
      <p className="text-sm text-muted-foreground">For games where PlayBound cannot enforce a player cap, the slot choice reserves server capacity instead of limiting admission. PlayBound stops those servers after 30 minutes of confirmed inactivity.</p>
    </section>

    <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">Games on Basic</h2><p className="text-sm text-muted-foreground">{games.length} games available for new servers. Here are a few favorites.</p></div><a href="#all-games" className="text-sm font-semibold text-primary hover:underline">See all {games.length} games →</a></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{featured.map((game) => <GameCard key={game.slug} game={toDiscoverListingGame(game)} className="!w-full" />)}</div>
    </section>

    <section className="grid gap-8 lg:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-6"><h2 className="text-2xl font-bold">Close to your players</h2><p className="mt-2 text-sm text-muted-foreground">Hosting locations update here as they come online. Choose an available region when you subscribe.</p><HostingRegionMap regions={tier.regions} /></div>
      <div className="rounded-2xl border border-border bg-card p-6"><h2 className="text-2xl font-bold">Your server, your people</h2><p className="mt-2 text-sm text-muted-foreground">Feature a public server on PlayBound, or share an unlisted server by link. Invite trusted PlayBound members to help run every server on your plan.</p><Link href="/hosting/servers" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Manage your servers →</Link></div>
    </section>

    <section id="all-games" className="space-y-4"><h2 className="text-2xl font-bold">All Basic games</h2><ul className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">{lineup.map((g) => <li key={g.gameSlug} className="flex items-start gap-2"><Server className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{g.requirement ? <span className="text-muted-foreground"><span className="font-medium text-foreground">{g.title}</span><span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs">Planned</span><span className="mt-1 block text-xs">{g.requirement}</span></span> : <Link href={`/hosting/${g.gameSlug}`} className="hover:text-primary hover:underline">{g.title}</Link>}</li>)}</ul><p className="text-xs text-muted-foreground">Linked games can use your slots once enabled and verified. Planned games cannot be selected or started yet.</p></section>
  </main>;
}
