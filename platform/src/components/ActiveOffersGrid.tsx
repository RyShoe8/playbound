"use client";

import { useMemo } from "react";
import { Gift } from "lucide-react";
import type { FreeOfferRecord } from "@/lib/freeOffers/types";
import { FreeGameCard } from "@/components/FreeGameCard";
import { EmptyHint } from "@/components/ui/bits";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { offerToGameLike } from "@/lib/freeOffers/compatibility";

export function ActiveOffersGrid({ offers }: { offers: FreeOfferRecord[] }) {
  const { mode, device } = useCompatibilityFilter();

  const filteredOffers = useMemo(() => {
    if (mode === "all") return offers;
    return offers.filter((offer) => isGameCompatible(offerToGameLike(offer), device.type));
  }, [offers, mode, device.type]);

  if (filteredOffers.length === 0) {
    return (
      <EmptyHint icon={Gift}>
        <p className="font-semibold">
          {mode === "compatible" && offers.length > 0
            ? `No active promotions compatible with ${device.type === "desktop" ? "PC" : device.type === "macos" ? "Mac" : "mobile"}`
            : "No active promotions right now"}
        </p>
        <p className="text-xs">
          {mode === "compatible" && offers.length > 0
            ? "Switch the compatibility filter above to 'All Games' to view giveaways for all platforms."
            : "Check back soon! New giveaways are added weekly."}
        </p>
      </EmptyHint>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredOffers.map((offer) => (
        <FreeGameCard
          key={`${offer.store}-${offer.externalId}`}
          offer={offer}
          className="w-full sm:w-full"
        />
      ))}
    </div>
  );
}
