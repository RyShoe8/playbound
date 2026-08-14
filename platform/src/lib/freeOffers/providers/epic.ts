/**
 * Epic Games Store free-game ingestion adapter.
 *
 * Uses the public free-games promotions endpoint that's already partially
 * consumed by epicStore.ts for newsletter media. This adapter extends that
 * to extract offer dates, pricing, and all game metadata.
 *
 * The promotions API returns both "current" and "upcoming" free games.
 * We only ingest offers whose effective date window includes now.
 */

import type { StoreProviderAdapter, DiscoveredOffer } from "./types";

const PROMOTIONS_URL =
  "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";

type PromotionOffer = {
  startDate?: string;
  endDate?: string;
  discountSetting?: { discountPercentage?: number };
};

type PromotionsContainer = {
  promotionalOffers?: { promotionalOffers?: PromotionOffer[] }[];
  upcomingPromotionalOffers?: { promotionalOffers?: PromotionOffer[] }[];
};

type CatalogElement = {
  id?: string;
  title?: string;
  description?: string;
  offerType?: string;
  keyImages?: { type?: string; url?: string }[];
  seller?: { name?: string };
  developer?: string;
  publisher?: string;
  categories?: { path?: string }[];
  tags?: { id?: string; name?: string }[];
  price?: {
    totalPrice?: {
      originalPrice?: number;
      discountPrice?: number;
      currencyCode?: string;
      fmtPrice?: { originalPrice?: string; discountPrice?: string };
    };
  };
  promotions?: PromotionsContainer;
  productSlug?: string;
  urlSlug?: string;
  catalogNs?: { mappings?: { pageSlug?: string; pageType?: string }[] };
  offerMappings?: { pageSlug?: string }[];
};

function pickImage(
  keyImages: CatalogElement["keyImages"],
  ...types: string[]
): string | null {
  if (!Array.isArray(keyImages)) return null;
  for (const type of types) {
    const hit = keyImages.find((img) => img?.type === type && img.url);
    if (hit?.url) return hit.url;
  }
  const any = keyImages.find((img) => img?.url);
  return any?.url ?? null;
}

function pageSlugFromElement(el: CatalogElement): string | null {
  const mappings = [
    ...((el.catalogNs?.mappings) ?? []),
    ...((el.offerMappings) ?? []),
  ];
  const home = mappings.find((m) => m.pageSlug);
  return home?.pageSlug?.trim() || el.productSlug?.trim() || el.urlSlug?.trim() || null;
}

function storeUrl(el: CatalogElement): string {
  const slug = pageSlugFromElement(el);
  if (slug) return `https://store.epicgames.com/p/${slug}`;
  return "https://store.epicgames.com";
}

function getCurrentPromotion(el: CatalogElement): PromotionOffer | null {
  const now = Date.now();

  // Check active promotional offers first.
  for (const group of el.promotions?.promotionalOffers ?? []) {
    for (const offer of group.promotionalOffers ?? []) {
      if (offer.discountSetting?.discountPercentage !== 0) continue; // Not 100% off.
      const start = offer.startDate ? new Date(offer.startDate).getTime() : 0;
      const end = offer.endDate ? new Date(offer.endDate).getTime() : Infinity;
      if (start <= now && now < end) return offer;
    }
  }

  return null;
}

function isBaseGame(el: CatalogElement): boolean {
  const categories = el.categories ?? [];
  // DLC/add-ons have "addons" or "dlc" in categories.
  const isDlc = categories.some(
    (c) => /dlc|addon/i.test(c.path ?? "")
  );
  return !isDlc;
}

export class EpicProviderAdapter implements StoreProviderAdapter {
  readonly store = "epic" as const;

  async fetchCurrentOffers(): Promise<DiscoveredOffer[]> {
    const res = await fetch(PROMOTIONS_URL, {
      headers: { "user-agent": "PlayBoundIngestion/1.0" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.error(`[epic-adapter] Promotions API returned ${res.status}`);
      return [];
    }

    const json = (await res.json()) as {
      data?: { Catalog?: { searchStore?: { elements?: CatalogElement[] } } };
    };

    const elements = json.data?.Catalog?.searchStore?.elements ?? [];
    const offers: DiscoveredOffer[] = [];

    for (const el of elements) {
      if (!el.id || !el.title) continue;

      const promo = getCurrentPromotion(el);
      if (!promo) continue; // Not currently free.

      const totalPrice = el.price?.totalPrice;
      const originalPriceCents = totalPrice?.originalPrice ?? 0;
      // Skip permanently free (F2P) games — they are not limited-time promotions.
      if (originalPriceCents === 0) continue;

      const coverImage = pickImage(
        el.keyImages,
        "OfferImageWide",
        "DieselStoreFrontWide",
        "Thumbnail",
        "OfferImageTall"
      );

      // Collect all key images as potential screenshots/hero images
      const allImages = (el.keyImages ?? [])
        .filter((img): img is { type: string; url: string } =>
          Boolean(img?.url)
        )
        .map((img) => img.url);

      let title = el.title?.trim() || "";
      if (!title || /^[0-9a-f]{16,}$/i.test(title)) {
        const slug = pageSlugFromElement(el);
        if (slug) {
          title = slug
            .replace(/[-_][a-f0-9]{5,}$/i, "")
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .trim();
        }
      }
      if (!title) continue;

      offers.push({
        externalId: el.id,
        title,
        store: "epic",
        offerType: "free_to_keep",
        startDate: promo.startDate ? new Date(promo.startDate) : null,
        endDate: promo.endDate ? new Date(promo.endDate) : null,
        claimUrl: storeUrl(el),
        storeUrl: storeUrl(el),
        coverImage,
        description: el.description?.trim() || null,
        developer: el.developer?.trim() || el.seller?.name?.trim() || null,
        publisher: el.publisher?.trim() || el.seller?.name?.trim() || null,
        platforms: ["Windows"], // Epic PC-only for free games.
        retailPrice: totalPrice?.fmtPrice?.originalPrice || null,
        retailPriceValue: originalPriceCents,
        currency: totalPrice?.currencyCode || "USD",
        isBaseGame: isBaseGame(el),
        videos: [], // Epic promotions API doesn't include videos; enriched later.
        redemptionPlatform: null,
        metadata: {
          title,
          epicOfferId: el.id,
          pageSlug: pageSlugFromElement(el),
          offerType: el.offerType,
          allImages,
        },
      });
    }

    return offers;
  }
}
