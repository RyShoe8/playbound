"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { PlayCta } from "@/components/GameCard";
import { Badge } from "@/components/ui/bits";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";

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

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border">
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
        <div className="pointer-events-auto relative z-[4] mt-2 flex flex-wrap items-center gap-3">
          <PlayCta game={hero} size="lg" />
          <Link
            href={`/games/${hero.slug}`}
            className="inline-flex h-12 items-center rounded-full border border-white/25 bg-white/10 px-7 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}
