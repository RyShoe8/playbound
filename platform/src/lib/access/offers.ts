/**
 * Purchase sources on a game.
 *
 * Offers answer where to buy it and what it costs today. They never decide
 * FREE vs VALUE — the resolver still does that from qualifying price and the
 * dependency chain. A weekend sale on Fanatical does not make a paid game
 * eligible, and a missing affiliate link does not make it ineligible.
 *
 * Steam, GOG, Epic, and Fanatical can fill `priceCents` from a public API
 * (`storePrices.ts`). Other names in this list are still valid stores; they
 * just cannot be auto-priced yet.
 */

import type { Cents, GameAccess, RetailOffer } from "./types";

export const KNOWN_RETAILERS = [
  "Steam",
  "GOG",
  "Epic Games Store",
  "Fanatical",
  "Humble Bundle",
  "itch.io",
  "Green Man Gaming",
  "GamersGate",
  "eBay",
] as const;

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return Boolean(raw) && typeof raw === "object";
}

function toIso(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function parseCents(raw: unknown): Cents | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  return Math.round(raw);
}

/** One stored offer, or null if it cannot be a purchase source. */
export function offerFromUnknown(raw: unknown): RetailOffer | null {
  if (!isRecord(raw)) return null;
  const retailer = typeof raw.retailer === "string" ? raw.retailer.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const priceCents = parseCents(raw.priceCents);
  if (!retailer || !url || priceCents == null) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return {
    retailer,
    url,
    priceCents,
    affiliate: raw.affiliate !== false,
    lastCheckedAt: toIso(raw.lastCheckedAt),
    isActive: raw.isActive !== false,
    matchSource: raw.matchSource === "auto" ? "auto" : "manual",
  };
}

export function offersFromUnknown(raw: unknown): RetailOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: RetailOffer[] = [];
  for (const item of raw) {
    const offer = offerFromUnknown(item);
    if (offer) out.push(offer);
  }
  return out;
}

export function activeOffers(access: GameAccess | undefined | null): RetailOffer[] {
  return (access?.offers ?? []).filter((o) => o.isActive && o.priceCents > 0 && o.url);
}

/** Displayed sources, cheapest first (affiliate wins a tie) — same order as Get Game. */
export function displayedPurchases(access: GameAccess | undefined | null): RetailOffer[] {
  return [...activeOffers(access)].sort((a, b) => {
    if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
    if (a.affiliate !== b.affiliate) return a.affiliate ? -1 : 1;
    return 0;
  });
}

/**
 * Primary Get Game plus the other displayed stores for the hero.
 *
 * Inactive rows stay off the page; they remain on the game as unmatched inventory.
 */
export function heroPurchases(access: GameAccess | undefined | null): {
  primary: RetailOffer | null;
  secondary: RetailOffer[];
} {
  const displayed = displayedPurchases(access);
  return { primary: displayed[0] ?? null, secondary: displayed.slice(1) };
}

/**
 * Flip one source's Display flag by URL. Current price follows remaining
 * displayed offers; with none left it clears so a hidden store is not advertised.
 */
export function setOfferDisplayed(
  access: GameAccess,
  url: string,
  isActive: boolean
): GameAccess | null {
  const target = url.trim();
  const offers = access.offers ?? [];
  if (!offers.some((o) => o.url === target)) return null;
  const nextOffers = offers.map((o) => (o.url === target ? { ...o, isActive } : o));
  const next = { ...access, offers: nextOffers };
  const best = bestPurchase(next);
  return { ...next, currentPriceCents: best ? best.priceCents : null };
}

/**
 * Remove one source completely by URL. Current price follows remaining
 * active displayed offers; with none left it clears.
 */
export function removeOffer(access: GameAccess, url: string): GameAccess | null {
  const target = url.trim();
  const offers = access.offers ?? [];
  if (!offers.some((o) => o.url === target)) return null;
  const nextOffers = offers.filter((o) => o.url !== target);
  const next = { ...access, offers: nextOffers };
  const best = bestPurchase(next);
  return { ...next, currentPriceCents: best ? best.priceCents : null };
}

/**
 * The offer the player should take: cheapest active source, affiliate first
 * when two cost the same.
 */
export function bestPurchase(access: GameAccess | undefined | null): RetailOffer | null {
  const active = activeOffers(access);
  if (active.length === 0) return null;
  let best = active[0];
  for (const offer of active) {
    if (offer.priceCents < best.priceCents) {
      best = offer;
      continue;
    }
    if (offer.priceCents === best.priceCents && offer.affiliate && !best.affiliate) {
      best = offer;
    }
  }
  return best;
}

/** Price shown on cards: cheapest live offer, else stored current, else qualifying. */
export function displayPriceCents(access: GameAccess | undefined | null): Cents | null {
  const offer = bestPurchase(access);
  if (offer) return offer.priceCents;
  if (typeof access?.currentPriceCents === "number" && access.currentPriceCents > 0) {
    return access.currentPriceCents;
  }
  if (typeof access?.qualifyingPriceCents === "number" && access.qualifyingPriceCents > 0) {
    return access.qualifyingPriceCents;
  }
  return null;
}

/**
 * Stamp `currentPriceCents` from the cheapest active offer.
 *
 * Qualifying is left alone — that field is eligibility, and a sale must not
 * rewrite it.
 */
export function withDerivedCurrentPrice(access: GameAccess): GameAccess {
  const offer = bestPurchase(access);
  if (!offer) return access;
  if (access.currentPriceCents === offer.priceCents) return access;
  return { ...access, currentPriceCents: offer.priceCents };
}
