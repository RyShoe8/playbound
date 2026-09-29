import Link from "next/link";
import type { Metadata } from "next";
import { Check, Server } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { loadPublicTier, publicGames } from "@/lib/dedicatedHosting/publicTier";

export const metadata: Metadata = pageMetadata({
  title: "Game Server Hosting — PlayBound Dedicated",
  description:
    "Buy a pool of player slots and run any mix of game servers with it: one big server or several small ones, switching games whenever you like. Maps, mods, admin tools and one-click joining included.",
  path: "/hosting",
});

function price(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Example splits of a slot pool, using only sizes a server can actually have (multiples of the increment). */
function combos(slots: number, min: number, step: number): string[] {
  const valid = (n: number) => n >= min && n % step === 0;
  const out = [`1 × ${slots}-player server`];
  if (valid(slots / 2)) out.push(`2 × ${slots / 2}-player servers`);
  else if (valid(slots - min) && slots - min !== min) out.push(`1 × ${slots - min} + 1 × ${min}-player servers`);
  if (slots >= min * 2 && valid(min)) out.push(`${Math.floor(slots / min)} × ${min}-player servers`);
  return [...new Set(out)];
}

const INCLUDED = [
  "PlayBound Server Control",
  "Maps & mods from the PlayBound catalog",
  "Automatic server-configuration backups",
  "Admin & moderation tools",
  "Listing in Multiplayer",
  "One-click join from the launcher",
  "Parties & Events",
];

export default async function HostingPage() {
  const { tier: t, live } = await loadPublicTier();
  const packages = [...(t.packages || [])].filter((p) => p.enabled !== false).sort((a, b) => a.order - b.order);
  const games = publicGames(t);
  const region = t.regions?.find((r) => r.salesEnabled)?.label || "US Central";
  const salesOpen = live && Boolean(t.salesEnabled);

  return (
    <div className="mx-auto max-w-5xl space-y-14 px-4 py-12 sm:px-6 lg:px-8">
      <section className="space-y-4 text-center">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">PlayBound Dedicated Basic</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Your slots. Your servers. Your games.</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Use your hosting slots however you want. Run one big server or several smaller ones, switch between supported
          games whenever you want, and manage everything through PlayBound.
        </p>
        <p className="text-sm text-muted-foreground">No config-file hunting. No FTP. No command-line setup.</p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/hosting/servers" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
            Manage my servers
          </Link>
        </div>
      </section>

      <section aria-label="Slot packages" className="space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Pick your slots</h2>
          <p className="text-sm text-muted-foreground">
            One slot is one player seat on a running server. Stopped servers use none. Hosted in {region}. Billed monthly,
            no setup fee.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => (
            <div key={p.slots} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-bold">{p.slots} slots</h3>
                <p className="text-lg font-semibold">
                  {price(p.priceCents)}
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                </p>
              </div>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground">
                {combos(p.slots, t.minAllocation || 4, t.allocationIncrement || 4).map((c) => (
                  <li key={c}>{c}</li>
                ))}
                <li>or any combination</li>
              </ul>
              <span className="mt-4 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-medium text-muted-foreground">
                {salesOpen ? "Checkout opening soon" : "Early access — coming soon"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 sm:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Included with every plan</h2>
          <ul className="space-y-2 text-sm">
            {INCLUDED.map((i) => (
              <li key={i} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" aria-hidden /> {i}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Games you can host</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {games.map((g) => (
              <li key={g.gameSlug} className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" aria-hidden />
                <Link href={`/hosting/${g.gameSlug}`} className="hover:text-primary hover:underline">{g.title}</Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Switch your slots between any of these at no charge. Your stopped servers keep their settings and worlds.
          </p>
        </div>
      </section>
    </div>
  );
}
