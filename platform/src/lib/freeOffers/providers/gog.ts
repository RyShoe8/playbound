/**
 * GOG free-game ingestion adapter.
 *
 * GOG occasionally offers games for free through giveaways on their
 * storefront. Uses GOG's public API endpoints to detect active giveaways.
 *
 * GOG giveaways are always "free to keep" — once claimed, the game is
 * permanently in the user's GOG library.
 */

import type { StoreProviderAdapter, DiscoveredOffer } from "./types";

/** GOG giveaway endpoint (public). */
const GOG_GIVEAWAY_URL = "https://www.gog.com/giveaway/claim";

/** GOG catalog search for free games. */
const GOG_CATALOG_URL =
  "https://catalog.gog.com/v1/catalog?limit=20&price=between%3A0%2C0&order=desc%3Atrending&productType=in%3Agame&page=1&countryCode=US&locale=en-US&currencyCode=USD";

/** GOG product details. */
function gogProductUrl(id: string): string {
  return `https://api.gog.com/products/${id}?expand=description,screenshots,videos&locale=en`;
}

type GogCatalogProduct = {
  id?: string;
  slug?: string;
  title?: string;
  coverHorizontal?: string;
  coverVertical?: string;
  price?: { baseAmount?: string; finalAmount?: string; isFree?: boolean };
  storeLink?: string;
  developers?: string[];
  publishers?: string[];
  operatingSystems?: string[];
  releaseDate?: string;
};

type GogProductDetails = {
  id?: number;
  title?: string;
  slug?: string;
  description?: { lead?: string; full?: string };
  images?: { logo?: string; logo2x?: string; background?: string };
  screenshots?: { image_id?: string; formatter_template_url?: string }[];
  videos?: { video_url?: string; thumbnail_url?: string; provider?: string }[];
  developers?: { slug?: string; name?: string }[];
  publishers?: { slug?: string; name?: string }[];
  content_system_compatibility?: { windows?: boolean; osx?: boolean; linux?: boolean };
};

function mapGogPlatforms(operatingSystems?: string[]): string[] {
  if (!operatingSystems?.length) return ["Windows"];
  const map: Record<string, string> = {
    windows: "Windows",
    osx: "macOS",
    linux: "Linux",
  };
  return operatingSystems
    .map((os) => map[os.toLowerCase()] ?? os)
    .filter(Boolean);
}

async function fetchProductDetails(id: string): Promise<GogProductDetails | null> {
  try {
    const res = await fetch(gogProductUrl(id), {
      headers: { "user-agent": "PlayBoundIngestion/1.0" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return (await res.json()) as GogProductDetails;
  } catch {
    return null;
  }
}

export class GogProviderAdapter implements StoreProviderAdapter {
  readonly store = "gog" as const;

  async fetchCurrentOffers(): Promise<DiscoveredOffer[]> {
    const offers: DiscoveredOffer[] = [];

    // Approach 1: Check the GOG catalog for products priced at $0 (active giveaways).
    try {
      const res = await fetch(GOG_CATALOG_URL, {
        headers: { "user-agent": "PlayBoundIngestion/1.0" },
        next: { revalidate: 0 },
      });

      if (res.ok) {
        const json = (await res.json()) as {
          products?: GogCatalogProduct[];
        };

        for (const product of json.products ?? []) {
          if (!product.id || !product.title) continue;
          // Must be genuinely a giveaway — price dropped to $0 with a base price above $0.
          const baseAmount = parseFloat(product.price?.baseAmount ?? "0");
          const finalAmount = parseFloat(product.price?.finalAmount ?? "0");
          if (finalAmount !== 0) continue;
          if (baseAmount <= 0 && !product.price?.isFree) continue;

          // If baseAmount is also $0, it's permanently free — skip.
          // Exception: if isFree is explicitly set, it might be a giveaway.
          if (baseAmount === 0 && !product.price?.isFree) continue;

          const gogId = String(product.id);
          const details = await fetchProductDetails(gogId);

          const coverImage =
            product.coverHorizontal ||
            product.coverVertical ||
            details?.images?.logo2x ||
            details?.images?.logo ||
            null;

          const videos: string[] = [];
          if (details?.videos) {
            for (const v of details.videos) {
              if (v.video_url) videos.push(v.video_url);
            }
          }

          const storeLink =
            product.storeLink ||
            (product.slug ? `https://www.gog.com/game/${product.slug}` : null) ||
            (details?.slug ? `https://www.gog.com/game/${details.slug}` : null);

          offers.push({
            externalId: gogId,
            title: product.title.trim(),
            store: "gog",
            offerType: "free_to_keep",
            startDate: null, // GOG doesn't expose giveaway start dates reliably.
            endDate: null,   // GOG giveaways often have undisclosed end dates.
            claimUrl: storeLink || GOG_GIVEAWAY_URL,
            storeUrl: storeLink || `https://www.gog.com`,
            coverImage,
            description: details?.description?.lead || null,
            developer:
              details?.developers?.[0]?.name ||
              product.developers?.[0] ||
              null,
            publisher:
              details?.publishers?.[0]?.name ||
              product.publishers?.[0] ||
              null,
            platforms: mapGogPlatforms(product.operatingSystems),
            retailPrice: baseAmount > 0 ? `$${baseAmount.toFixed(2)}` : null,
            retailPriceValue: baseAmount > 0 ? Math.round(baseAmount * 100) : null,
            currency: "USD",
            isBaseGame: true, // GOG giveaways are almost always base games.
            videos,
            redemptionPlatform: null,
            metadata: {
              gogId,
              gogSlug: product.slug || details?.slug,
            },
          });
        }
      }
    } catch (err) {
      console.error("[gog-adapter] Failed to fetch GOG catalog:", err);
    }

    return offers;
  }
}
