import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { getGame } from "@/lib/catalog";
import { allowedSlotSizes } from "@/lib/dedicatedHosting/tier";
import { loadPublicTier, publicGames } from "@/lib/dedicatedHosting/publicTier";
import { getServerSettingProfile, CONTROL_FEATURE_LABELS } from "@/lib/serverControl/settings";

type Props = { params: Promise<{ gameSlug: string }> };

/** One page per game on sale, e.g. /hosting/openra — "OpenRA server hosting". */
export async function generateStaticParams() {
  const { tier } = await loadPublicTier();
  return publicGames(tier).map((g) => ({ gameSlug: g.gameSlug }));
}

async function load(gameSlug: string) {
  const { tier } = await loadPublicTier();
  const game = publicGames(tier).find((g) => g.gameSlug === gameSlug);
  if (!game) return null;
  const sizes = [
    ...new Set(
      tier.games
        .filter((g) => g.profileKey.startsWith(`${gameSlug}:`) && g.enabled !== false && g.newServerCreationEnabled !== false)
        .flatMap((g) => allowedSlotSizes(tier, g))
    ),
  ].sort((a, b) => a - b);
  const catalog = await getGame(gameSlug).catch(() => undefined);
  const cheapest = [...tier.packages].filter((p) => p.enabled !== false).sort((a, b) => a.priceCents - b.priceCents)[0];
  return { tier, game, sizes, catalog, cheapest };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameSlug } = await params;
  const data = await load(gameSlug);
  if (!data) return { title: "Not Found" };
  return pageMetadata({
    title: `${data.game.title} Server Hosting — PlayBound Dedicated`,
    description: `Host a ${data.game.title} server with PlayBound Dedicated Basic: use your slots for ${data.game.title} today and switch them to another supported game tomorrow. Maps, admin tools, server-configuration backups and one-click joining included.`,
    path: `/hosting/${gameSlug}`,
  });
}

export default async function GameHostingPage({ params }: Props) {
  const { gameSlug } = await params;
  const data = await load(gameSlug);
  if (!data) notFound();
  const { tier, game, sizes, catalog, cheapest } = data;
  const profile = getServerSettingProfile(gameSlug);
  const live = Boolean(profile?.controlChannel);
  const controls = [
    ...new Set((profile?.settings ?? []).map((s) => s.feature).filter((f): f is NonNullable<typeof f> => Boolean(f) && f !== "slots")),
  ].map((f) => CONTROL_FEATURE_LABELS[f]);
  const others = publicGames(tier).filter((g) => g.gameSlug !== gameSlug);
  const smallest = sizes[0] || 4;

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-12 sm:px-6 lg:px-8">
      <section className="space-y-4">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Included with PlayBound Dedicated Basic</p>
        <h1 className="text-4xl font-bold tracking-tight">{game.title} Server Hosting</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Use your slots for {game.title} today and switch them to another supported game tomorrow. No config files, no FTP,
          no command line — set it up and manage it from PlayBound.
        </p>
        {catalog?.tagline ? <p className="max-w-2xl text-sm text-muted-foreground">{catalog.tagline}</p> : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/hosting" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {cheapest ? `See plans — from $${(cheapest.priceCents / 100).toFixed(2)}/month` : "See plans"}
          </Link>
          <Link href={`/games/${gameSlug}`} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
            About {game.title}
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Your {game.title} server</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Sizes: {sizes.join(", ")} players</li>
            {game.editions.length ? (
              <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Editions: {game.editions.join(", ")}</li>
            ) : null}
            {controls.length ? (
              <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Settings you can change: {controls.join(", ")}</li>
            ) : null}
            {live ? (
              <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Live player list, kicks, bans and a game console</li>
            ) : null}
            {profile?.maps ? (
              <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Change maps{profile.maps.rotation ? " and set a rotation" : ""} while people play</li>
            ) : null}
            <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Listed in PlayBound Multiplayer with one-click join</li>
            <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Invite admins and moderators</li>
          </ul>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">How slots work</h2>
          <p className="text-sm text-muted-foreground">
            {`A plan is a pool of player slots. A ${smallest}-player ${game.title} server uses ${smallest} of them while it runs, and none while it's stopped. Run several servers at once, or stop this one and start a different game with the same slots — no charge for switching, and your stopped servers keep their settings.`}
          </p>
        </div>
      </section>

      {others.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Also included</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {others.map((g) => (
              <li key={g.gameSlug}>
                <Link href={`/hosting/${g.gameSlug}`} className="inline-flex rounded-full border border-border px-3 py-1 hover:bg-secondary">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
