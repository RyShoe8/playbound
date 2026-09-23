"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Tag, Clock } from "lucide-react";
import type { DiscountedGame } from "@/lib/dealsShared";
import {
  formatCents,
  cleanDealTitle,
  inferGameGenres,
  formatDetailedTimeLeft,
} from "@/lib/dealsShared";
import { Badge } from "@/components/ui/bits";
import { cn } from "@/lib/utils";

/**
 * One store-wide discount, for /deals.
 *
 * Separate from FreeGameCard because the two say different things. A free
 * offer is a countdown — claim it before it expires. A discount is a
 * comparison — this is what it costs and what it normally costs.
 *
 * Most of these have no PlayBound catalog page: `slug` is the exception, not
 * the rule (see `matchedGameSlug` on the `StoreDiscount` model), so the
 * primary action is always the store link, never `/games/{slug}`. A slug, when
 * one happens to exist, only adds a secondary link — it never replaces the
 * store CTA.
 *
 * `game.storeUrl` arrives already final — UTM-tagged and, where PlayBound has
 * a live affiliate program for that store, affiliate-stamped — by
 * `storeDiscounts/service.ts`'s `buildStoreUrl()`. This component must not
 * wrap it again: re-running UTM tagging on an already-wrapped affiliate
 * template URL would tag the tracking redirect instead of the real
 * destination, not the game.
 */
export function DiscountedGameCard({
  game,
  className,
}: {
  game: DiscountedGame;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [from, to] = game.art ? [game.art.from, game.art.to] : ["#1e1b4b", "#312e81"];
  const title = cleanDealTitle(game.title);
  const genres = game.genres?.length ? game.genres : inferGameGenres(title);
  const expiry = formatDetailedTimeLeft(game.endDate);

  return (
    <div
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]",
        className
      )}
    >
      <div className="relative block aspect-[16/9] overflow-hidden bg-secondary">
        {game.coverImage && !imgFailed ? (
          <Image
            src={game.coverImage}
            alt={title}
            fill
            sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgFailed(true)}
            unoptimized
          />
        ) : (
          <div
            className="flex size-full items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
          >
            <Tag className="size-8 text-white/30" />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <Badge tone="play">-{game.percentOff}%</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="font-bold leading-tight">{title}</p>
        {genres.length > 0 && (
          <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">
            {genres.slice(0, 3).join(" · ")}
          </p>
        )}

        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold">
              {formatCents(game.currentPriceCents, game.currency)}
            </span>
            <span className="text-xs text-muted-foreground line-through">
              {formatCents(game.regularPriceCents, game.currency)}
            </span>
          </div>
          {expiry && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400">
              <Clock className="size-3" />
              {expiry}
            </span>
          )}
        </div>

        {game.storeUrl && (
          <a
            href={game.storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {game.storeName ? `Buy on ${game.storeName}` : "View deal"}
            <ExternalLink className="size-3.5" />
          </a>
        )}

        {/* Rare: only present when a best-effort catalog match happens to exist. */}
        {game.slug && (
          <Link
            href={`/games/${game.slug}`}
            className="text-center text-[11px] font-semibold text-muted-foreground hover:text-primary hover:underline"
          >
            Also on PlayBound
          </Link>
        )}
      </div>
    </div>
  );
}
