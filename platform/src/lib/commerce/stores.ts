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
  prime_gaming: {
    discovery: "manual",
    livePrice: false,
    titleSearch: false,
    feedIngest: false,
    freeOfferIngest: true,
    retailer: null,
  },
};

export const SEED_COMMERCE_STORES: Array<{
  slug: CommerceStoreSlug;
  name: string;
  baseUrl: string;
  color: string;
  active: boolean;
  matchingEnabled: boolean;
  priceRefreshEnabled: boolean;
  affiliateDefault: boolean;
  discovery: StoreDiscovery;
}> = [
  {
    slug: "steam",
    name: "Steam",
    baseUrl: "https://store.steampowered.com",
    color: "oklch(0.68 0.14 250)",
    active: true,
    matchingEnabled: true,
    priceRefreshEnabled: true,
    affiliateDefault: true,
    discovery: "api",
  },
  {
    slug: "gog",
    name: "GOG",
    baseUrl: "https://www.gog.com",
    color: "oklch(0.72 0.18 310)",
    active: true,
    matchingEnabled: true,
    priceRefreshEnabled: true,
    affiliateDefault: true,
    discovery: "api",
  },
  {
    slug: "epic",
    name: "Epic Games Store",
    baseUrl: "https://store.epicgames.com",
    color: "oklch(0.70 0.14 220)",
    active: true,
    matchingEnabled: true,
    priceRefreshEnabled: true,
    affiliateDefault: true,
    discovery: "api",
  },
  {
    slug: "fanatical",
    name: "Fanatical",
    baseUrl: "https://www.fanatical.com",
    color: "oklch(0.70 0.16 30)",
    active: true,
    matchingEnabled: true,
    priceRefreshEnabled: true,
    affiliateDefault: true,
    discovery: "api",
  },
  {
    slug: "humble",
    name: "Humble Bundle",
    baseUrl: "https://www.humblebundle.com",
    color: "oklch(0.72 0.16 80)",
    active: true,
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: true,
    discovery: "feed",
  },
  {
    slug: "itch",
    name: "itch.io",
    baseUrl: "https://itch.io",
    color: "oklch(0.68 0.18 15)",
    active: true,
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: true,
    discovery: "manual",
  },
  {
    slug: "gmg",
    name: "Green Man Gaming",
    baseUrl: "https://www.greenmangaming.com",
    color: "oklch(0.62 0.14 145)",
    active: true,
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: true,
    discovery: "feed",
  },
  {
    slug: "prime_gaming",
    name: "Amazon Prime Gaming",
    baseUrl: "https://gaming.amazon.com",
    color: "oklch(0.72 0.18 170)",
    active: true,
    matchingEnabled: false,
    priceRefreshEnabled: false,
    affiliateDefault: false,
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
  return isCommerceStoreSlug(want) ? want : null;
}

export function storeSlugToRetailer(slug: CommerceStoreSlug): string | null {
  return STORE_CAPABILITIES[slug].retailer;
}
