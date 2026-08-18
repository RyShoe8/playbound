/**
 * Live prices from storefront APIs.
 *
 * Admin pastes a product URL; we detect the store and ask that store what it
 * costs in USD today. Offers never decide FREE vs VALUE — they only fill
 * current/regular prices. Qualifying stays a PlayBound judgement, defaulting
 * to the store's list price the first time we see it.
 */

import { parseEpicProductSlug } from "@/lib/epicStore";
import {
  ebayItemPriceCents,
  isEbayItemUrl,
  isEbaySearchUrl,
  lowestEbaySearchPriceCents,
  withEbayPriceSort,
} from "./ebayPrices";
import { detectRetailer, parseFanaticalSlug, parseGogSlug, parseSteamAppId } from "./storeUrls";
import type { Cents } from "./types";

export { detectRetailer, parseFanaticalSlug, parseGogSlug, parseSteamAppId } from "./storeUrls";

export type StorePriceLookup = {
  retailer: string;
  url: string;
  priceCents: Cents;
  listPriceCents: Cents | null;
};

export class StorePriceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorePriceError";
  }
}

function dollarsToCents(raw: unknown): Cents | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw * 100);
  }
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }
  return null;
}

function centsInt(raw: unknown): Cents | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  return Math.round(raw);
}

const UA = "PlayBoundAdmin/1.0";

async function lookupSteam(url: string): Promise<StorePriceLookup> {
  const appId = parseSteamAppId(url);
  if (!appId) throw new StorePriceError("That does not look like a Steam store URL.");
  const res = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&cc=us&l=english`,
    { headers: { "user-agent": UA }, next: { revalidate: 0 } }
  );
  if (!res.ok) throw new StorePriceError(`Steam did not return a price (${res.status}).`);
  const json = (await res.json()) as Record<
    string,
    {
      success?: boolean;
      data?: {
        is_free?: boolean;
        price_overview?: { final?: number; initial?: number; currency?: string };
      };
    }
  >;
  const entry = json[appId];
  if (!entry?.success || !entry.data) {
    throw new StorePriceError("Steam has no listing at that URL.");
  }
  if (entry.data.is_free && !entry.data.price_overview) {
    throw new StorePriceError("That Steam listing is free — it is not a purchase source.");
  }
  const live = centsInt(entry.data.price_overview?.final);
  const list = centsInt(entry.data.price_overview?.initial);
  if (live == null || live <= 0) {
    throw new StorePriceError("Steam did not report a USD price for that app.");
  }
  return {
    retailer: "Steam",
    url: `https://store.steampowered.com/app/${appId}`,
    priceCents: live,
    listPriceCents: list && list > 0 ? list : live,
  };
}

async function lookupGog(url: string): Promise<StorePriceLookup> {
  const slug = parseGogSlug(url);
  if (!slug) throw new StorePriceError("That does not look like a GOG product URL.");
  const catalog = new URL("https://catalog.gog.com/v1/catalog");
  catalog.searchParams.set("limit", "10");
  catalog.searchParams.set("query", `like:${slug}`);
  catalog.searchParams.set("productType", "in:game,pack");
  catalog.searchParams.set("countryCode", "US");
  catalog.searchParams.set("locale", "en-US");
  catalog.searchParams.set("currencyCode", "USD");
  const res = await fetch(catalog, { headers: { "user-agent": UA }, next: { revalidate: 0 } });
  if (!res.ok) throw new StorePriceError(`GOG did not return a price (${res.status}).`);
  const json = (await res.json()) as {
    products?: Array<{
      slug?: string;
      storeLink?: string;
      price?: {
        finalAmount?: string;
        baseAmount?: string;
        finalMoney?: { amount?: string };
        baseMoney?: { amount?: string };
        isFree?: boolean;
      };
    }>;
  };
  const products = json.products ?? [];
  const hit = products.find((p) => p.slug === slug) ?? products[0];
  if (!hit) throw new StorePriceError("GOG has no listing matching that URL.");
  if (hit.price?.isFree) {
    throw new StorePriceError("That GOG listing is free — it is not a purchase source.");
  }
  const live =
    dollarsToCents(hit.price?.finalMoney?.amount ?? hit.price?.finalAmount);
  const list =
    dollarsToCents(hit.price?.baseMoney?.amount ?? hit.price?.baseAmount);
  if (live == null || live <= 0) {
    throw new StorePriceError("GOG did not report a USD price for that product.");
  }
  return {
    retailer: "GOG",
    url: hit.storeLink || `https://www.gog.com/game/${slug}`,
    priceCents: live,
    listPriceCents: list && list > 0 ? list : live,
  };
}

type EpicSearchElement = {
  title?: string;
  productSlug?: string;
  urlSlug?: string;
  catalogNs?: { mappings?: { pageSlug?: string; pageType?: string }[] };
  offerMappings?: { pageSlug?: string; pageType?: string }[];
  price?: { totalPrice?: { discountPrice?: number; originalPrice?: number } };
};

function epicSlugsOn(el: EpicSearchElement): string[] {
  const out: string[] = [];
  for (const raw of [el.productSlug, el.urlSlug]) {
    if (raw) out.push(raw.replace(/\/.*$/, "").toLowerCase());
  }
  for (const m of [...(el.catalogNs?.mappings ?? []), ...(el.offerMappings ?? [])]) {
    if (m.pageSlug) out.push(m.pageSlug.toLowerCase());
  }
  return out;
}

async function lookupEpic(url: string): Promise<StorePriceLookup> {
  const slug = parseEpicProductSlug(url);
  if (!slug) throw new StorePriceError("That does not look like an Epic product URL.");
  const keywords = slug.replace(/-[0-9a-f]{4,8}$/i, "").replace(/-/g, " ");
  const res = await fetch("https://graphql.epicgames.com/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({
      query: `query searchStore($keywords: String!) {
        Catalog {
          searchStore(count: 8, country: "US", keywords: $keywords, locale: "en-US") {
            elements {
              title
              productSlug
              urlSlug
              catalogNs { mappings { pageSlug pageType } }
              offerMappings { pageSlug pageType }
              price { totalPrice { discountPrice originalPrice } }
            }
          }
        }
      }`,
      variables: { keywords },
    }),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new StorePriceError(`Epic did not return a price (${res.status}).`);
  const json = (await res.json()) as {
    data?: { Catalog?: { searchStore?: { elements?: EpicSearchElement[] } } };
  };
  const elements = json.data?.Catalog?.searchStore?.elements ?? [];
  const want = slug.toLowerCase();
  const hit =
    elements.find((el) => epicSlugsOn(el).includes(want)) ??
    elements.find((el) => epicSlugsOn(el).some((s) => s.startsWith(want) || want.startsWith(s))) ??
    elements[0];
  if (!hit) throw new StorePriceError("Epic has no listing matching that URL.");
  const live = centsInt(hit.price?.totalPrice?.discountPrice);
  const list = centsInt(hit.price?.totalPrice?.originalPrice);
  if (live == null || live <= 0) {
    throw new StorePriceError("Epic did not report a USD price for that product.");
  }
  return {
    retailer: "Epic Games Store",
    url: `https://store.epicgames.com/p/${slug}`,
    priceCents: live,
    listPriceCents: list && list > 0 ? list : live,
  };
}

async function lookupFanatical(url: string): Promise<StorePriceLookup> {
  const slug = parseFanaticalSlug(url);
  if (!slug) throw new StorePriceError("That does not look like a Fanatical product URL.");
  const res = await fetch(`https://www.fanatical.com/api/products/${encodeURIComponent(slug)}`, {
    headers: { "user-agent": UA, accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new StorePriceError(`Fanatical did not return a price (${res.status}).`);
  const json = (await res.json()) as {
    current_price?: Record<string, number>;
    price?: Record<string, number>;
    discount_price?: Record<string, number>;
  };
  const live =
    dollarsToCents(json.current_price?.USD ?? json.discount_price?.USD ?? json.price?.USD);
  const list = dollarsToCents(json.price?.USD);
  if (live == null || live <= 0) {
    throw new StorePriceError("Fanatical did not report a USD price for that product.");
  }
  return {
    retailer: "Fanatical",
    url: `https://www.fanatical.com/en/game/${slug}`,
    priceCents: live,
    listPriceCents: list && list > 0 ? list : live,
  };
}

const EBAY_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function fetchEbayHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": EBAY_UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new StorePriceError(`eBay did not return listings (${res.status}).`);
  const html = await res.text();
  if (/pardon our interruption|captcha|security.?check/i.test(html) && html.length < 8000) {
    throw new StorePriceError("eBay did not return listings.");
  }
  return html;
}

async function lookupEbay(url: string): Promise<StorePriceLookup> {
  if (isEbayItemUrl(url)) {
    const html = await fetchEbayHtml(url);
    const live = ebayItemPriceCents(html);
    if (live == null || live <= 0) {
      throw new StorePriceError("eBay did not report a price for that item.");
    }
    return { retailer: "eBay", url, priceCents: live, listPriceCents: live };
  }
  if (!isEbaySearchUrl(url)) {
    throw new StorePriceError("Paste an eBay search or item URL.");
  }
  const html = await fetchEbayHtml(withEbayPriceSort(url));
  const live = lowestEbaySearchPriceCents(html);
  if (live == null || live <= 0) {
    throw new StorePriceError("eBay did not return listings.");
  }
  return { retailer: "eBay", url, priceCents: live, listPriceCents: live };
}

export async function lookupStorePrice(url: string): Promise<StorePriceLookup> {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new StorePriceError("Paste a full https:// store URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new StorePriceError("Paste a full https:// store URL.");
  }

  const retailer = detectRetailer(trimmed);
  if (retailer === "Steam") return lookupSteam(trimmed);
  if (retailer === "GOG") return lookupGog(trimmed);
  if (retailer === "Epic Games Store") return lookupEpic(trimmed);
  if (retailer === "Fanatical") return lookupFanatical(trimmed);
  if (retailer === "eBay") return lookupEbay(trimmed);
  if (retailer === "Humble Bundle" || retailer === "itch.io" || retailer === "Green Man Gaming") {
    throw new StorePriceError(
      `${retailer} does not expose a public price API we can use yet. Use Steam, GOG, Epic, Fanatical, or an eBay search.`
    );
  }
  throw new StorePriceError(
    "Unknown store. Use a Steam, GOG, Epic Games Store, Fanatical, or eBay search URL."
  );
}
