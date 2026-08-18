/**
 * Storefronts PlayBound can buy from or ingest promotions from.
 *
 * Not every store has a public catalog API. Some publish a product feed
 * (CSV / JSON / XML). Others have neither — those stay manual: paste a
 * product URL on the game. The admin Stores page configures which of those
 * three paths a store uses; it does not invent a new protocol.
 */

export const COMMERCE_STORE_SLUGS = [
  "steam",
  "gog",
  "epic",
  "fanatical",
  "humble",
  "itch",
  "gmg",
  "gamersgate",
  "ebay",
  "prime_gaming",
] as const;

export type CommerceStoreSlug = (typeof COMMERCE_STORE_SLUGS)[number];

export function isCommerceStoreSlug(value: unknown): value is CommerceStoreSlug {
  return typeof value === "string" && (COMMERCE_STORE_SLUGS as readonly string[]).includes(value);
}

/** How we discover products for this store. */
export type StoreDiscovery = "api" | "feed" | "manual";

export type StoreCapabilities = {
  /** Default discovery path. Admin can still paste a feed URL on API stores. */
  discovery: StoreDiscovery;
  livePrice: boolean;
  titleSearch: boolean;
  feedIngest: boolean;
  freeOfferIngest: boolean;
  /** Display name on purchase sources, or null when the store is promotions-only. */
  retailer: string | null;
};

export const STORE_CAPABILITIES: Record<CommerceStoreSlug, StoreCapabilities> = {
  steam: {
    discovery: "api",
    livePrice: true,
    titleSearch: true,
    feedIngest: false,
    freeOfferIngest: true,
    retailer: "Steam",
  },
  gog: {
    discovery: "api",
    livePrice: true,
    titleSearch: true,
    feedIngest: false,
    freeOfferIngest: true,
    retailer: "GOG",
  },
  epic: {
    discovery: "api",
    livePrice: true,
    titleSearch: true,
    feedIngest: false,
    freeOfferIngest: true,
    retailer: "Epic Games Store",
  },
  fanatical: {
    discovery: "api",
    livePrice: true,
    titleSearch: true,
    feedIngest: true,
    retailer: "Fanatical",
    freeOfferIngest: false,
  },
  humble: {
    discovery: "feed",
    livePrice: false,
    titleSearch: false,
    feedIngest: true,
    freeOfferIngest: false,
    retailer: "Humble Bundle",
  },
  itch: {
    discovery: "manual",
    livePrice: false,
    titleSearch: false,
    feedIngest: true,
    freeOfferIngest: false,
    retailer: "itch.io",
  },
  gmg: {
    discovery: "feed",
    livePrice: false,
    titleSearch: false,
    feedIngest: true,
    freeOfferIngest: false,
    retailer: "Green Man Gaming",
  },
  gamersgate: {
    discovery: "feed",
    livePrice: false,
    titleSearch: false,
    feedIngest: true,
    freeOfferIngest: false,
    retailer: "GamersGate",
  },
  ebay: {
    discovery: "manual",
    livePrice: false,
    titleSearch: false,
    feedIngest: true,
    freeOfferIngest: false,
    retailer: "eBay",
  },
  prime_gaming: {
    discovery: "manual",
    livePrice: false,
    titleSearch: false,
    feedIngest: false,
    freeOfferIngest: true,
    retailer: null,
  },
};

/** Query key used when the admin leaves Affiliate param blank. */
export const AFFILIATE_PARAM_DEFAULTS: Partial<Record<CommerceStoreSlug, string>> = {
  gog: "pp",
  humble: "partner",
  itch: "ac",
  gmg: "tap_a",
  ebay: "campid",
};

export const SEED_COMMERCE_STORES: Array<{
  slug: CommerceStoreSlug;
  name: string;
  baseUrl: string;
  color: string;
  matchingEnabled: boolean;
  priceRefreshEnabled: boolean;
  affiliateDefault: boolean;
  freeOffersEnabled: boolean;
  discovery: StoreDiscovery;
}> = [
  {
    slug: "steam",
    name: "Steam",
    baseUrl: "https://store.steampowered.com",
    color: "oklch(0.68 0.14 250)",
    matchingEnabled: true,
    priceRefreshEnabled: true,
    affiliateDefault: true,
    freeOffersEnabled: true,
    discovery: "api",
  },
  {
    slug: "gog",
    name: "GOG",
    baseUrl: "https://www.gog.com",
    color: "oklch(0.72 0.18 310)",
    matchingEnabled: true,
    priceRefreshEnabled: true,
    affiliateDefault: true,
    freeOffersEnabled: true,
    discovery: "api",
  },
  {
    slug: "epic",
    name: "Epic Games Store",
    baseUrl: "https://store.epicgames.com",
    color: "oklch(0.70 0.14 220)",
    matchingEnabled: true,
    priceRefreshEnabled: true,
    affiliateDefault: true,
    freeOffersEnabled: true,
    discovery: "api",
  },
  {
    slug: "fanatical",
    name: "Fanatical",
    baseUrl: "https://www.fanatical.com",
    color: "oklch(0.70 0.16 30)",
    matchingEnabled: true,
    priceRefreshEnabled: true,
    affiliateDefault: true,
    freeOffersEnabled: false,
    discovery: "api",
  },
  {
    slug: "humble",
    name: "Humble Bundle",
    baseUrl: "https://www.humblebundle.com",
    color: "oklch(0.72 0.16 80)",
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: true,
    freeOffersEnabled: false,
    discovery: "feed",
  },
  {
    slug: "itch",
    name: "itch.io",
    baseUrl: "https://itch.io",
    color: "oklch(0.68 0.18 15)",
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: true,
    freeOffersEnabled: false,
    discovery: "manual",
  },
  {
    slug: "gmg",
    name: "Green Man Gaming",
    baseUrl: "https://www.greenmangaming.com",
    color: "oklch(0.62 0.14 145)",
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: true,
    freeOffersEnabled: false,
    discovery: "feed",
  },
  {
    slug: "gamersgate",
    name: "GamersGate",
    baseUrl: "https://www.gamersgate.com",
    color: "oklch(0.64 0.12 250)",
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: true,
    freeOffersEnabled: false,
    discovery: "feed",
  },
  {
    slug: "ebay",
    name: "eBay",
    baseUrl: "https://www.ebay.com",
    color: "oklch(0.62 0.19 30)",
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: true,
    freeOffersEnabled: false,
    discovery: "manual",
  },
  {
    slug: "prime_gaming",
    name: "Amazon Prime Gaming",
    baseUrl: "https://gaming.amazon.com",
    color: "oklch(0.72 0.18 170)",
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: false,
    freeOffersEnabled: true,
    discovery: "manual",
  },
];

export function retailerToStoreSlug(retailer: string): CommerceStoreSlug | null {
  const want = retailer.trim().toLowerCase();
  for (const slug of COMMERCE_STORE_SLUGS) {
    const name = STORE_CAPABILITIES[slug].retailer;
    if (name && name.toLowerCase() === want) return slug;
  }
  if (want === "epic") return "epic";
  if (want === "green man gaming") return "gmg";
  if (want === "gamersgate") return "gamersgate";
  if (want === "ebay") return "ebay";
  return isCommerceStoreSlug(want) ? want : null;
}

export function storeSlugToRetailer(slug: CommerceStoreSlug): string | null {
  return STORE_CAPABILITIES[slug].retailer;
}
