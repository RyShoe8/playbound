/**
 * Steam free-game ingestion adapter.
 *
 * Uses the public Steam Store API to find temporarily free games.
 * Distinguishes between:
 *   - free_to_keep: 100% discount, permanently added to library
 *   - free_weekend: temporary access window
 *
 * Filters out permanently F2P games to avoid polluting the weekly section.
 */

import type { StoreProviderAdapter, DiscoveredOffer } from "./types";
import type { OfferType } from "../types";

/** Steam featured items API — returns specials, free games, etc. */
const STEAM_FEATURED_URL =
  "https://store.steampowered.com/api/featuredcategories?cc=us&l=english";

/** Steam app details for individual game metadata. */
function steamAppDetailsUrl(appId: string): string {
  return `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=english`;
}

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
  /** 0 = game, 1 = dlc, etc. */
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
      subs?: { is_free_license?: boolean }[];
    }[];
  };
};

function steamPlatforms(item: SteamFeaturedItem): string[] {
  const platforms: string[] = [];
  if (item.windows_available) platforms.push("Windows");
  if (item.mac_available) platforms.push("macOS");
  if (item.linux_available) platforms.push("Linux");
  return platforms.length ? platforms : ["Windows"];
}

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

export class SteamProviderAdapter implements StoreProviderAdapter {
  readonly store = "steam" as const;

  async fetchCurrentOffers(): Promise<DiscoveredOffer[]> {
    let featuredItems: SteamFeaturedItem[] = [];

    try {
      const res = await fetch(STEAM_FEATURED_URL, {
        headers: { "user-agent": "PlayBoundIngestion/1.0" },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        console.error(`[steam-adapter] Featured API returned ${res.status}`);
        return [];
      }

      const json = (await res.json()) as Record<string, { items?: SteamFeaturedItem[] }>;

      // Specials section contains discounted games including 100% off.
      const specials = json.specials?.items ?? [];
      // Sometimes free games also appear in top_sellers or coming_soon.
      featuredItems = specials;
    } catch (err) {
      console.error("[steam-adapter] Failed to fetch featured categories:", err);
      return [];
    }

    const offers: DiscoveredOffer[] = [];

    for (const item of featuredItems) {
      if (!item.id || !item.name) continue;
      // Must be 100% discount (final_price === 0 and original_price > 0).
      if (item.discount_percent !== 100) continue;
      if (!item.original_price || item.original_price <= 0) continue;
      // Skip DLC.
      if (item.type === 1) continue;

      const appId = String(item.id);
      const endDate = item.discount_expiration
        ? new Date(item.discount_expiration * 1000)
        : null;

      // Try to get detailed info for better metadata.
      const details = await fetchAppDetails(appId);

      // Determine offer type: free weekend vs free to keep.
      let offerType: OfferType = "free_to_keep";
      if (details) {
        // If the game is marked is_free, it's permanently free — skip.
        if (details.is_free) continue;
        // Check for weekend-style licensing.
        const categories = details.categories ?? [];
        const hasFreeWeekendCategory = categories.some(
          (c) => /free.*weekend/i.test(c.description ?? "")
        );
        if (hasFreeWeekendCategory) offerType = "free_weekend";
      }

      // If end date is very close (< 3 days) and no "keep" indicator, likely weekend.
      if (endDate && offerType === "free_to_keep") {
        const hoursLeft = (endDate.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursLeft > 0 && hoursLeft < 72) {
          // Short window — might be a free weekend. Conservative: keep as free_to_keep
          // unless we have explicit weekend indicators.
        }
      }

      const coverImage =
        item.large_capsule_image ||
        item.header_image ||
        details?.header_image ||
        null;

      const videos: string[] = [];
      if (details?.movies) {
        for (const movie of details.movies) {
          const url = movie.mp4?.max || movie.mp4?.["480"] || movie.webm?.max;
          if (url) videos.push(url);
        }
      }

      // Original price formatting.
      const originalPriceCents = item.original_price;
      const retailPrice = originalPriceCents
        ? `$${(originalPriceCents / 100).toFixed(2)}`
        : details?.price_overview?.initial_formatted || null;

      offers.push({
        externalId: appId,
        title: details?.name || item.name.trim(),
        store: "steam",
        offerType,
        startDate: null, // Steam doesn't expose start dates in this API.
        endDate,
        claimUrl: `https://store.steampowered.com/app/${appId}`,
        storeUrl: `https://store.steampowered.com/app/${appId}`,
        coverImage,
        description: details?.short_description || null,
        developer: details?.developers?.[0] || null,
        publisher: details?.publishers?.[0] || null,
        platforms: details ? appDetailPlatforms(details) : steamPlatforms(item),
        retailPrice,
        retailPriceValue: originalPriceCents ?? null,
        currency: item.currency || details?.price_overview?.currency || "USD",
        isBaseGame: (details?.type ?? "game") === "game",
        videos,
        redemptionPlatform: null,
        metadata: {
          steamAppId: appId,
          discountExpiration: item.discount_expiration,
          steamType: details?.type,
        },
      });
    }

    return offers;
  }
}
