"use client";

import { useMemo } from "react";
import { Gift } from "lucide-react";
import type { FreeOfferRecord } from "@/lib/freeOffers/types";
import { FreeGameCard, FreeGameCardRow } from "@/components/FreeGameCard";
import { Badge } from "@/components/ui/bits";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { offerToGameLike } from "@/lib/freeOffers/compatibility";

export function FreeGamesSectionClient({ offers }: { offers: FreeOfferRecord[] }) {
  const { mode, device } = useCompatibilityFilter();

  const filteredOffers = useMemo(() => {
    if (mode === "all") return offers;
    return offers.filter((offer) => isGameCompatible(offerToGameLike(offer), device.type));
  }, [offers, mode, device.type]);

  if (filteredOffers.length === 0) {
    // If all active giveaways are incompatible with current device and mode is "compatible",
    // gracefully hide the section on the homepage.
    return null;
  }

  return (
    <section id="free-games-this-week">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <Badge tone="play" className="mb-2">
            <Gift className="size-3" /> Free Games
          </Badge>
          <h2 className="text-xl font-bold tracking-tight">
            🎁 Free Games This Week
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Claim these games before their free offers expire.
          </p>
        </div>
        <a
          href="/free-games"
          className="shrink-0 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          See all free games →
        </a>
      </div>

      {/* Single unified row for all stores */}
      <FreeGameCardRow>
        {filteredOffers.map((offer) => (
          <FreeGameCard
            key={`${offer.store}-${offer.externalId}`}
            offer={offer}
          />
        ))}
      </FreeGameCardRow>
    </section>
  );
}
