/**
 * Steam free-game ingestion adapter.
 *
 * Uses both Steam's Store Search API (filtered by maxprice=free&specials=1)
 * and Featured Categories API to discover temporarily free games.
 *
 * Distinguishes between:
 *   - free_to_keep: 100% discount or limited-time free promotional license
 *   - free_weekend: temporary access window
 *
 * Filters out permanently F2P games to avoid polluting the free deals section.
 */

import type { StoreProviderAdapter, DiscoveredOffer } from "./types";
import type { OfferType } from "../types";

/** Steam search specials endpoint — finds games currently discounted to free. */
const STEAM_SEARCH_SPECIALS_URL =
  "https://store.steampowered.com/search/results/?query=&start=0&count=50&maxprice=free&specials=1&json=1";

/** Steam featured items API — returns featured specials, promos, etc. */
const STEAM_FEATURED_URL =
  "https://store.steampowered.com/api/featuredcategories?cc=us&l=english";

/** Steam app details for individual game metadata. */
function steamAppDetailsUrl(appId: string): string {
  return `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english`;
}

type SteamSearchItem = {
  name?: string;
  logo?: string;
  link?: string;
};

type SteamFeaturedItem = {
  id?: number;
  name?: string;
  discounted?: boolean;
  discount_percent?: number;
  original_price?: number;
  final_price?: number;
  currency?: string;
  large_capsule_image?: string;
  small_capsule_image?: string;
  header_image?: string;
  discount_expiration?: number;
  type?: number;
  windows_available?: boolean;
  mac_available?: boolean;
  linux_available?: boolean;
};

type SteamAppDetails = {
  success?: boolean;
  data?: {
    steam_appid?: number;
    name?: string;
    type?: string;
    is_free?: boolean;
    short_description?: string;
    developers?: string[];
    publishers?: string[];
    header_image?: string;
    movies?: { mp4?: { max?: string; 480?: string }; webm?: { max?: string } }[];
    platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
    price_overview?: {
      currency?: string;
      initial?: number;
      final?: number;
      discount_percent?: number;
      initial_formatted?: string;
      final_formatted?: string;
    };
    categories?: { id?: number; description?: string }[];
    package_groups?: {
      subs?: {
        packageid?: number;
        percent_savings_text?: string;
        percent_savings?: number;
        option_text?: string;
        is_free_license?: boolean;
        price_in_cents_with_discount?: number;
      }[];
    }[];
  };
};

function appDetailPlatforms(data: SteamAppDetails["data"]): string[] {
  if (!data?.platforms) return ["Windows"];
  const platforms: string[] = [];
  if (data.platforms.windows) platforms.push("Windows");
  if (data.platforms.mac) platforms.push("macOS");
  if (data.platforms.linux) platforms.push("Linux");
  return platforms.length ? platforms : ["Windows"];
}

async function fetchAppDetails(appId: string): Promise<SteamAppDetails["data"] | null> {
  try {
    const res = await fetch(steamAppDetailsUrl(appId), {
      headers: { "user-agent": "PlayBoundIngestion/1.0" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, SteamAppDetails>;
    const entry = json[appId];
    return entry?.success ? entry.data ?? null : null;
  } catch {
    return null;
  }
}

async function fetchPackageDetails(packageId: number): Promise<{ discount_expiration?: number } | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/packagedetails?packageids=${packageId}&cc=us&l=english`,
      {
        headers: { "user-agent": "PlayBoundIngestion/1.0" },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Record<
      string,
      { success?: boolean; data?: { price?: { discount_expiration?: number } } }
    >;
    const entry = json[String(packageId)];
    return entry?.success ? entry.data?.price ?? null : null;
  } catch {
    return null;
  }
}

export class SteamProviderAdapter implements StoreProviderAdapter {
  readonly store = "steam" as const;

  async fetchCurrentOffers(): Promise<DiscoveredOffer[]> {
    const candidateAppIds = new Set<string>();
    const expirationByAppId = new Map<string, number>();

    // 1. Check Steam Search Specials with maxprice=free
    try {
      const res = await fetch(STEAM_SEARCH_SPECIALS_URL, {
        headers: { "user-agent": "PlayBoundIngestion/1.0" },
        next: { revalidate: 0 },
      });
      if (res.ok) {
        const json = (await res.json()) as { items?: SteamSearchItem[] };
        for (const item of json.items ?? []) {
          // Extract appId from logo URL (e.g. /apps/214340/capsule...) or link URL
          const match = (item.logo || item.link || "").match(/\/apps\/(\d+)/i);
          if (match?.[1]) {
            candidateAppIds.add(match[1]);
          }
        }
      }
    } catch (err) {
      console.error("[steam-adapter] Failed to fetch search specials:", err);
    }

    // 2. Check Steam Featured Categories for 100% off deals
    try {
      const res = await fetch(STEAM_FEATURED_URL, {
        headers: { "user-agent": "PlayBoundIngestion/1.0" },
        next: { revalidate: 0 },
      });
      if (res.ok) {
        const json = (await res.json()) as Record<string, { items?: SteamFeaturedItem[] }>;
        for (const cat of Object.values(json)) {
          for (const item of cat.items ?? []) {
            if (item.id && (item.discount_percent === 100 || item.final_price === 0)) {
              const idStr = String(item.id);
              candidateAppIds.add(idStr);
              if (item.discount_expiration) {
                expirationByAppId.set(idStr, item.discount_expiration);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[steam-adapter] Failed to fetch featured categories:", err);
    }

    const offers: DiscoveredOffer[] = [];

    // 3. Inspect each candidate app in detail
    for (const appId of candidateAppIds) {
      const details = await fetchAppDetails(appId);
      if (!details) continue;

      // Skip non-game items if type is DLC/soundtrack etc.
      if (details.type && details.type !== "game") continue;

      const priceOverview = details.price_overview;
      const initialPriceCents = priceOverview?.initial ?? 0;
      const discountPercent = priceOverview?.discount_percent ?? 0;

      // Check if any package has a free promotional license (e.g. "Limited Free Promotional Package")
      let hasFreePromoPackage = false;
      let promoPackageBaselineCents = initialPriceCents;
      let discountExpiration: number | null = expirationByAppId.get(appId) ?? null;

      for (const pg of details.package_groups ?? []) {
        for (const sub of pg.subs ?? []) {
          if (sub.is_free_license && sub.price_in_cents_with_discount === 0) {
            hasFreePromoPackage = true;
          } else if (sub.price_in_cents_with_discount && sub.price_in_cents_with_discount > 0) {
            if (!promoPackageBaselineCents) {
              promoPackageBaselineCents = sub.price_in_cents_with_discount;
            }
          }

          if (!discountExpiration && sub.packageid) {
            const pkgData = await fetchPackageDetails(sub.packageid);
            if (pkgData?.discount_expiration) {
              discountExpiration = pkgData.discount_expiration;
            }
          }
        }
      }

      // Check if this is a genuine 100% off discount or free promo package on a paid game
      const is100Discount = discountPercent === 100 && initialPriceCents > 0;
      const isPromotionalFree =
        hasFreePromoPackage && (initialPriceCents > 0 || promoPackageBaselineCents > 0);

      if (!is100Discount && !isPromotionalFree) {
        // Not a temporary free promotion — could be a permanently free F2P title, skip.
        continue;
      }

      // Determine offer type: free_weekend vs free_to_keep
      let offerType: OfferType = "free_to_keep";
      const categories = details.categories ?? [];
      const hasFreeWeekendCategory = categories.some((c) =>
        /free.*weekend/i.test(c.description ?? "")
      );
      if (hasFreeWeekendCategory) {
        offerType = "free_weekend";
      }

      const coverImage = details.header_image || null;
      const videos: string[] = [];
      if (details.movies) {
        for (const movie of details.movies) {
          const url = movie.mp4?.max || movie.mp4?.["480"] || movie.webm?.max;
          if (url) videos.push(url);
        }
      }

      const retailPriceVal = initialPriceCents > 0 ? initialPriceCents : promoPackageBaselineCents;
      const retailPriceFormatted =
        priceOverview?.initial_formatted ||
        (retailPriceVal > 0 ? `$${(retailPriceVal / 100).toFixed(2)}` : null);

      // Resolve endDate from explicit expiration or standard steam promotion cutoff
      let endDate: Date | null = null;
      if (discountExpiration && discountExpiration > 0) {
        endDate = new Date(discountExpiration * 1000);
      } else {
        // Fallback to standard Steam promotional window (upcoming Thursday 10:00 AM PT / 17:00 UTC)
        const cutoff = new Date();
        const daysToThursday = (4 + 7 - cutoff.getUTCDay()) % 7 || 7;
        cutoff.setUTCDate(cutoff.getUTCDate() + daysToThursday);
        cutoff.setUTCHours(17, 0, 0, 0);
        endDate = cutoff;
      }

      offers.push({
        externalId: appId,
        title: (details.name || `Steam App ${appId}`).trim(),
        store: "steam",
        offerType,
        startDate: new Date(),
        endDate,
        claimUrl: `https://store.steampowered.com/app/${appId}`,
        storeUrl: `https://store.steampowered.com/app/${appId}`,
        coverImage,
        description: details.short_description || null,
        developer: details.developers?.[0] || null,
        publisher: details.publishers?.[0] || null,
        platforms: appDetailPlatforms(details),
        retailPrice: retailPriceFormatted,
        retailPriceValue: retailPriceVal || null,
        currency: priceOverview?.currency || "USD",
        isBaseGame: (details.type ?? "game") === "game",
        videos,
        redemptionPlatform: null,
        metadata: {
          steamAppId: appId,
          steamType: details.type,
          hasFreePromoPackage,
        },
      });
    }

    return offers;
  }
}
