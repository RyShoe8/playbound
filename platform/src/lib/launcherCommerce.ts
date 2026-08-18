/**
 * Compact access + purchase payloads for the Electron launcher.
 *
 * The launcher must not re-derive FREE vs VALUE or stamp affiliate/UTM itself.
 * Catalog entries get a tier and a card price; game detail gets ready-to-open
 * store URLs.
 */

import type { Game } from "@/lib/data/types";
import type { GameAccess, RetailOffer } from "@/lib/access/types";
import type { GameTier } from "@/lib/access/tierMap";
import { FREE_TIER } from "@/lib/access/tierMap";
import { gameRequiresPurchase } from "@/lib/access/resolver";
import { activeOffers, bestPurchase } from "@/lib/access/offers";
import { withStoreAffiliate } from "@/lib/access/storeUrls";
import { withOutboundUtm } from "@/lib/utm";

export type StoreAffiliateMap = Record<string, { id: string; param: string }>;

export type LauncherAccessFields = {
  accessTier: GameTier["tier"];
  fromPriceCents: number | null;
};

export type LauncherCommerceOffer = {
  retailer: string;
  url: string;
  priceCents: number;
  affiliate: boolean;
};

export type LauncherCommerce = {
  requiresPurchase: boolean;
  fromPriceCents: number | null;
  regularPriceCents: number | null;
  qualifyingPriceCents: number | null;
  buy: LauncherCommerceOffer | null;
  sources: LauncherCommerceOffer[];
  requires: Array<{
    label: string;
    slug: string | null;
    currentPriceCents: number | null;
  }>;
};

export function accessFieldsForLauncher(tier: GameTier | undefined | null): LauncherAccessFields {
  const t = tier ?? FREE_TIER;
  return {
    accessTier: t.tier,
    fromPriceCents: t.fromPriceCents,
  };
}

function purchaseHref(
  offer: RetailOffer,
  slug: string,
  affiliates: StoreAffiliateMap
): string {
  const stamp = affiliates[offer.retailer];
  const tagged = withStoreAffiliate(offer.url, {
    affiliate: offer.affiliate,
    id: stamp?.id,
    param: stamp?.param,
  });
  return withOutboundUtm(tagged, {
    campaign: "game_get",
    content: slug,
    medium: "launcher",
  });
}

function toOffer(
  offer: RetailOffer,
  slug: string,
  affiliates: StoreAffiliateMap
): LauncherCommerceOffer {
  return {
    retailer: offer.retailer,
    url: purchaseHref(offer, slug, affiliates),
    priceCents: offer.priceCents,
    affiliate: Boolean(offer.affiliate),
  };
}

export function toLauncherCommerce(
  game: Pick<Game, "slug" | "access">,
  tier: GameTier | undefined | null,
  affiliates: StoreAffiliateMap = {}
): LauncherCommerce {
  const t = tier ?? FREE_TIER;
  const access = game.access as GameAccess | undefined;
  const buy = bestPurchase(access);
  const sources = activeOffers(access)
    .slice()
    .sort((a, b) => a.priceCents - b.priceCents);
  return {
    requiresPurchase: gameRequiresPurchase(access),
    fromPriceCents: t.fromPriceCents,
    regularPriceCents: access?.regularPriceCents ?? null,
    qualifyingPriceCents: access?.qualifyingPriceCents ?? t.qualifyingPriceCents,
    buy: buy ? toOffer(buy, game.slug, affiliates) : null,
    sources: sources.map((offer) => toOffer(offer, game.slug, affiliates)),
    requires: (t.requires || [])
      .filter((r) => r.slug && r.slug !== game.slug)
      .map((r) => ({
        label: r.label,
        slug: r.slug,
        currentPriceCents: r.currentPriceCents ?? r.qualifyingPriceCents,
      })),
  };
}
