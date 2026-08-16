"use client";

import Image from "next/image";
import { Gift, ExternalLink, Clock } from "lucide-react";
import type { FreeOfferRecord } from "@/lib/freeOffers/types";
import {
  offerTypeLabel,
  claimCtaLabel,
  expirationLabel,
  storeShortName,
  storeColor,
} from "@/lib/freeOffers/labels";
import { Badge } from "@/components/ui/bits";
import { cn } from "@/lib/utils";
import { useIncompatibilityLabel } from "@/components/compatibility/useFilteredGames";
import { offerToGameLike } from "@/lib/freeOffers/compatibility";

// ── Store icons (inline SVG paths for zero-dependency rendering) ─────────

function StoreIcon({ store, className }: { store: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex size-4 items-center justify-center rounded-sm text-[9px] font-bold text-white", className)}
      style={{ background: storeColor(store as FreeOfferRecord["store"]) }}
    >
      {store === "epic" && "E"}
      {store === "steam" && "S"}
      {store === "gog" && "G"}
      {store === "prime_gaming" && "P"}
    </span>
  );
}

function humanizeGameSlug(slug: string): string {
  return slug
    .replace(/[-_][a-f0-9]{5,}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ── FreeGameCard ─────────────────────────────────────────────────────────

export function FreeGameCard({
  offer,
  className,
}: {
  offer: FreeOfferRecord;
  className?: string;
}) {
  const metaTitle = offer.metadata?.title as string | undefined;
  const displayTitle =
    (metaTitle && !/^[0-9a-f]{16,}$/i.test(metaTitle) ? metaTitle : null) ||
    (offer.unmatchedTitle && !/^[0-9a-f]{16,}$/i.test(offer.unmatchedTitle)
      ? offer.unmatchedTitle
      : null) ||
    (offer.gameSlug && !/^[0-9a-f]{16,}$/i.test(offer.gameSlug)
      ? humanizeGameSlug(offer.gameSlug)
      : null) ||
    (offer.store === "epic"
      ? "Epic Free Game"
      : offer.store === "steam"
      ? "Steam Free Game"
      : "Free Game Deal");
  const expiry = expirationLabel(offer.endDate);
  const typeLabel = offerTypeLabel(offer.offerType, offer.store);
  const ctaLabel = claimCtaLabel(offer.store);
  const incompLabel = useIncompatibilityLabel(offerToGameLike(offer));

  return (
    <div
      className={cn(
        "group flex h-full w-[250px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] sm:w-[276px]",
        className
      )}
    >
      {/* ── 3:4 Poster Art ─────────────────────────────────────────── */}
      <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-secondary">
        {offer.coverImage ? (
          <Image
            src={offer.coverImage}
            alt={displayTitle}
            fill
            sizes="(max-width: 640px) 250px, 276px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized={!/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(offer.coverImage)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Gift className="size-10 text-muted-foreground/40" />
          </div>
        )}

        {/* Top-left Store badge */}
        <div className="absolute top-2 left-2 z-20">
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm"
            style={{
              background: `color-mix(in oklch, ${storeColor(offer.store)}, transparent 20%)`,
            }}
          >
            <StoreIcon store={offer.store} className="size-3" />
            {storeShortName(offer.store)}
          </span>
        </div>

        {/* Top-right Offer badge */}
        <div className="absolute top-2 right-2 z-20">
          <span className="rounded-md bg-play/90 px-2 py-0.5 text-[10px] font-bold text-play-foreground shadow-sm backdrop-blur-sm">
            {typeLabel}
          </span>
        </div>

        {/* Incompatibility badge */}
        {incompLabel && (
          <div className="absolute bottom-2 left-2 z-20">
            <span className="rounded-md border border-border/80 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              {incompLabel}
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom Body ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col justify-between border-t border-border/70 bg-card/90 p-3">
        <div>
          <p className="line-clamp-1 text-sm font-bold text-foreground">
            {displayTitle}
          </p>

          <div className="mt-1 flex items-center justify-between gap-2 text-xs">
            {offer.retailPrice ? (
              <p>
                <span className="text-muted-foreground line-through">
                  {offer.retailPrice}
                </span>{" "}
                <span className="font-bold text-play">FREE</span>
              </p>
            ) : (
              <span className="font-bold text-play">100% FREE</span>
            )}
            {expiry && (
              <p className="flex items-center gap-1 text-[11px] font-medium text-amber-400">
                <Clock className="size-3" />
                {expiry}
              </p>
            )}
          </div>
        </div>

        {/* CTA */}
        <a
          href={offer.claimUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 active:translate-y-px text-xs font-bold transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3" />
          {ctaLabel}
        </a>
      </div>
    </div>
  );
}

/** Horizontally scrolling row for free game cards. */
export function FreeGameCardRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-1 flex snap-x items-stretch gap-4 overflow-x-auto px-1 pt-1 pb-2">
      {children}
    </div>
  );
}
