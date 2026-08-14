import type { FreeOfferRecord } from "./types";
import type { GameLike } from "@/lib/compatibility/compatibility";

/**
 * Normalizes a FreeOfferRecord into a GameLike structure for device
 * compatibility matching. Free store giveaways (Steam, Epic, GOG) default
 * to Windows if no explicit platform array is provided.
 */
export function offerToGameLike(offer: FreeOfferRecord): GameLike {
  const platforms =
    offer.platforms && offer.platforms.length > 0
      ? offer.platforms
      : ["Windows"];
  return {
    platforms,
    browserPlayable: false,
    steamDeck: false,
  };
}
