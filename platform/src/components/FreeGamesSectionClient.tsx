"use client";

import { useMemo } from "react";
import { Gift } from "lucide-react";
import type { FreeOfferRecord } from "@/lib/freeOffers/types";
import { FreeGameCard, FreeGameCardRow } from "@/components/FreeGameCard";
import { Badge } from "@/components/ui/bits";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { offerToGameLike } from "@/lib/freeOffers/compatibility";

export function FreeGamesSectionClient({ offers, diversifyStores = false }: { offers: FreeOfferRecord[]; diversifyStores?: boolean }) {
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

  const displayed = diversifyStores ? interleaveStores(filteredOffers) : filteredOffers;
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
        {displayed.map((offer) => (
          <FreeGameCard
            key={`${offer.store}-${offer.externalId}`}
            offer={offer}
          />
        ))}
      </FreeGameCardRow>
    </section>
  );
}

/** Round-robin active stores so a large giveaway feed cannot bury the others. */
function interleaveStores(offers: FreeOfferRecord[]): FreeOfferRecord[] {
  const groups = new Map<string, FreeOfferRecord[]>();
  for (const offer of offers) groups.set(offer.store, [...(groups.get(offer.store) || []), offer]);
  const result: FreeOfferRecord[] = [];
  for (let i = 0; result.length < offers.length; i++) {
    for (const group of groups.values()) if (group[i]) result.push(group[i]);
  }
  return result;
}
