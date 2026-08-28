import { editionSupportsPartyPlay } from "@/lib/multiplayer/support";

export type PartyEditionOption = {
  slug: string;
  isDefault?: boolean;
  features?: string[];
  tags?: string[];
  type?: string;
  name?: string;
  shortDescription?: string;
};

/**
 * Keep a party on a network-capable edition, even when an older party record
 * still names the game's general-purpose singleplayer default.
 */
export function preferredPartyEditionSlug(
  editions: PartyEditionOption[],
  currentSlug?: string | null
): string | null {
  if (editions.length <= 1) return null;

  const partyEditions = editions.filter(editionSupportsPartyPlay);
  const candidates = partyEditions.length > 0 ? partyEditions : editions;
  if (currentSlug && candidates.some((edition) => edition.slug === currentSlug)) {
    return currentSlug;
  }
  return (candidates.find((edition) => edition.isDefault) ?? candidates[0])?.slug ?? null;
}
