"use client";

import { Gift, ExternalLink, Clock, History } from "lucide-react";
import type { FreeOfferRecord } from "@/lib/freeOffers/types";
import {
  offerTypeLabel,
  claimCtaLabel,
  expirationLabel,
  dateRangeLabel,
  storeDisplayName,
  storeColor,
} from "@/lib/freeOffers/labels";
import { cn } from "@/lib/utils";

interface FreeOfferBannerProps {
  activeOffer?: FreeOfferRecord | null;
  historicalOffers?: FreeOfferRecord[];
  className?: string;
}

export function FreeOfferBanner({
  activeOffer,
  historicalOffers = [],
  className,
}: FreeOfferBannerProps) {
  if (!activeOffer && (!historicalOffers || historicalOffers.length === 0)) {
    return null;
  }

  // Active offer taking priority
  if (activeOffer) {
    const typeLabel = offerTypeLabel(activeOffer.offerType, activeOffer.store);
    const ctaLabel = claimCtaLabel(activeOffer.store);
    const expiry = expirationLabel(activeOffer.endDate);
    const storeName = storeDisplayName(activeOffer.store);

    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-play/30 bg-gradient-to-r from-play/10 via-card to-card p-4 sm:p-5",
          className
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-play/20 px-2 py-0.5 text-xs font-bold text-play">
                <Gift className="size-3.5" /> Currently Free
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                {typeLabel}
              </span>
            </div>
            <h3 className="text-base font-bold sm:text-lg">
              Free on {storeName}
            </h3>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {activeOffer.retailPrice && (
                <span className="mr-2 line-through">{activeOffer.retailPrice}</span>
              )}
              {expiry ? (
                <span className="inline-flex items-center gap-1 text-amber-300 font-medium">
                  <Clock className="size-3.5" /> {expiry}
                </span>
              ) : (
                <span>Limited time free promotion</span>
              )}
              {activeOffer.redemptionPlatform && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (Redeems on {activeOffer.redemptionPlatform})
                </span>
              )}
            </p>
          </div>

          <a
            href={activeOffer.claimUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-play px-4 py-2.5 text-sm font-bold text-play-foreground shadow-[0_0_20px_-5px_var(--play)] transition-all hover:brightness-110 active:translate-y-px"
          >
            <ExternalLink className="size-4" />
            {ctaLabel}
          </a>
        </div>
      </div>
    );
  }

  // If only historical promotions exist
  const mostRecent = historicalOffers[0];
  if (!mostRecent) return null;

  const storeName = storeDisplayName(mostRecent.store);
  const dates = dateRangeLabel(mostRecent.startDate, mostRecent.endDate);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card/60 p-4 text-sm text-muted-foreground",
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <History className="mt-0.5 size-4 text-muted-foreground shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground">Previously Free</p>
          <p className="text-xs">
            This game was available for free on {storeName} ({dates}).
          </p>
        </div>
      </div>
    </div>
  );
}
