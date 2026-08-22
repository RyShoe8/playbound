"use client";

import Link from "next/link";
import { Sparkles, Layers, ShoppingCart } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { PlayCta } from "@/components/GameCard";
import { Badge } from "@/components/ui/bits";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { directPurchaseRequired } from "@/lib/access/resolver";
import { accessPriceLabel } from "@/lib/access/discoveryMode";
import { formatEditionChipName, getDisplayEditionsForGame } from "@/lib/data/editions";

/**
 * Homepage spotlight: newest catalog game, preferring one compatible with
 * the current device when the filter is set to Compatible.
 * `gamesNewestFirst` must already be sorted by createdAt desc.
 */
export function HomeHero({ gamesNewestFirst }: { gamesNewestFirst: Game[] }) {
  const { mode, device } = useCompatibilityFilter();

  const hero =
    (mode === "compatible"
      ? gamesNewestFirst.find((g) => isGameCompatible(g, device.type))
      : gamesNewestFirst[0]) ?? gamesNewestFirst[0];

  if (!hero) return null;

  const isPaid = directPurchaseRequired(hero.access);
  const price = accessPriceLabel(hero.access?.currentPriceCents ?? null);
  const buyOffer = hero.access?.offers?.[0];
  const displayEditions = getDisplayEditionsForGame(hero.slug);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border shadow-md">
      <GameArt
        game={hero}
        showTitle={false}
        className="pointer-events-none absolute inset-0 z-0"
        iconSize="lg"
      />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-black/85 via-black/55 to-black/10" />
      <Link
        href={`/games/${hero.slug}`}
        className="absolute inset-0 z-[2]"
        aria-label={`${hero.title} — view game`}
      />
      <div className="pointer-events-none relative z-[3] flex min-h-[380px] flex-col justify-end gap-4 p-6 sm:p-10 lg:max-w-2xl">
        <Badge tone="play" className="w-fit">
          <Sparkles className="size-3" /> Newest
        </Badge>
        <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          {hero.title}
        </h2>
        <p className="max-w-xl text-sm text-white/85 sm:text-base">{hero.tagline}</p>
        <p className="text-sm text-white/70">
          {hero.genres.join(" / ")} · {hero.releaseYear}
        </p>

        {displayEditions.length > 0 && (
          <div className="pointer-events-auto relative z-[4] flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-bold text-white/90">Editions:</span>
            {displayEditions.map((ed) => (
              <Link
                key={ed.slug}
                href={`/games/${hero.slug}/editions/${ed.slug}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/50 px-3 py-1 text-xs font-semibold text-white/95 backdrop-blur transition-all hover:border-primary/60 hover:bg-primary/25 hover:text-white hover:scale-105"
              >
                <Layers className="size-3 text-primary" />
                {formatEditionChipName(ed.name)}
              </Link>
            ))}
          </div>
        )}

        <div className="pointer-events-auto relative z-[4] mt-2 flex flex-wrap items-center gap-3">
          {isPaid ? (
            <>
              {buyOffer ? (
                <a
                  href={buyOffer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-play px-7 text-base font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px"
                >
                  <ShoppingCart className="size-5" />
                  Buy {buyOffer.retailer ? `on ${buyOffer.retailer}` : "Game"} — {price}
                </a>
              ) : (
                <Link
                  href={`/games/${hero.slug}`}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-play px-7 text-base font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px"
                >
                  <ShoppingCart className="size-5" />
                  Buy Game — {price}
                </Link>
              )}
              <Link
                href={`/games/${hero.slug}`}
                className="inline-flex h-12 items-center rounded-full border border-white/25 bg-white/10 px-7 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                View Details & Editions
              </Link>
            </>
          ) : (
            <>
              <PlayCta game={hero} size="lg" />
              <Link
                href={`/games/${hero.slug}`}
                className="inline-flex h-12 items-center rounded-full border border-white/25 bg-white/10 px-7 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                Learn More
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
