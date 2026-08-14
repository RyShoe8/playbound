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
        "group flex w-52 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] sm:w-56",
        className
      )}
    >
      {/* ── Cover image ─────────────────────────────────────────── */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-secondary">
        {offer.coverImage ? (
          <Image
            src={offer.coverImage}
            alt={displayTitle}
            fill
            sizes="(max-width: 640px) 208px, 224px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized={!/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(offer.coverImage)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Gift className="size-8 text-muted-foreground/40" />
          </div>
        )}

        {/* Store badge */}
        <div className="absolute top-2 left-2">
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm"
            style={{
              background: `color-mix(in oklch, ${storeColor(offer.store)}, transparent 25%)`,
            }}
          >
            <StoreIcon store={offer.store} className="size-3" />
            {storeShortName(offer.store)}
          </span>
        </div>

        {/* Offer type badge */}
        <div className="absolute top-2 right-2">
          <span className="rounded-md bg-play/90 px-1.5 py-0.5 text-[10px] font-bold text-play-foreground backdrop-blur-sm">
            {typeLabel}
          </span>
        </div>

        {/* Incompatibility badge when viewing All Games on another platform */}
        {incompLabel && (
          <div className="absolute bottom-2 left-2">
            <span className="rounded-md border border-border/80 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              {incompLabel}
            </span>
          </div>
        )}
      </div>

      {/* ── Card body ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-tight">
          {displayTitle}
        </p>

        {/* Price */}
        {offer.retailPrice && (
          <p className="text-xs">
            <span className="text-muted-foreground line-through">
              {offer.retailPrice}
            </span>
            <span className="ml-1.5 font-bold text-play">FREE</span>
          </p>
        )}

        {/* Expiration */}
        {expiry && (
          <p className="flex items-center gap-1 text-[11px] text-amber-300/90">
            <Clock className="size-3" />
            {expiry}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* CTA */}
        <a
          href={offer.claimUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/25 active:translate-y-px"
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
