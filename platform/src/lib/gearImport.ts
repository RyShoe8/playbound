/**
 * Affiliate-link import for admin gear drafts.
 * Uses Open Graph / page meta + JSON-LD Product/Offer when available.
 * Amazon URLs use a dedicated HTML parser (About this item, gallery, etc.).
 */

import { slugifyTitle } from "@/lib/gamePayload";
import {
  assertPublicHttpUrl,
  softTitleFromUrl,
  stripHtml,
  tryFetchPageMeta,
} from "@/lib/pageMeta";
import { rehostImageToBlob } from "@/lib/fetchGameMedia";
import {
  dedupeProductImages,
  isAmazonProductUrl,
  parseAmazonProduct,
  type GearCategory,
} from "@/lib/amazonGear";

/** Keep cover + screenshots aligned with candidate picker capacity. */
const MAX_GALLERY_IMAGES = 20;

export type GearImportAffiliate = {
  retailer: string;
  url: string;
  price: string | null;
  shipping: string | null;
  isActive: boolean;
};

export type GearImportDraft = {
  title: string;
  slug: string;
  description: string;
  category: GearCategory | null;
  coverImage: string | null;
  screenshots: string[];
  manufacturer: string | null;
  platforms: string[];
  videos: string[];
  candidateImages: string[];
  affiliateLinks: GearImportAffiliate[];
};

export type GearImportResult = {
  ok: true;
  draft: GearImportDraft;
  retailer: string;
  price: string | null;
  warnings: string[];
};

const RETAILER_HOSTS: { match: RegExp; label: string }[] = [
  { match: /(^|\.)amazon\./i, label: "Amazon" },
  { match: /(^|\.)amzn\.(to|com)/i, label: "Amazon" },
  { match: /(^|\.)bestbuy\./i, label: "Best Buy" },
  { match: /(^|\.)newegg\./i, label: "Newegg" },
  { match: /(^|\.)walmart\./i, label: "Walmart" },
  { match: /(^|\.)target\./i, label: "Target" },
  { match: /(^|\.)bhphotovideo\./i, label: "B&H" },
  { match: /(^|\.)ebay\./i, label: "eBay" },
  { match: /(^|\.)aliexpress\./i, label: "AliExpress" },
  { match: /(^|\.)etsy\./i, label: "Etsy" },
  { match: /(^|\.)microsoft\./i, label: "Microsoft" },
  { match: /(^|\.)store\.playstation\./i, label: "PlayStation Store" },
];

export function detectRetailer(url: string, siteName?: string | null): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    for (const row of RETAILER_HOSTS) {
      if (row.match.test(host)) return row.label;
    }
    if (siteName?.trim()) return siteName.trim().slice(0, 60);
    const root = host.split(".")[0] || host;
    return root.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return siteName?.trim() || "Store";
  }
}

function formatPrice(amount: unknown, currency?: string | null): string | null {
  if (amount == null || amount === "") return null;
  const n = typeof amount === "number" ? amount : Number(String(amount).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) {
    const raw = String(amount).trim();
    return raw ? raw.slice(0, 40) : null;
  }
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur.length === 3 ? cur : "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

type JsonLdProduct = {
  name?: string;
  description?: string;
  brand?: string | { name?: string };
  image?: string | string[] | { url?: string }[];
  offers?:
    | {
        price?: string | number;
        lowPrice?: string | number;
        priceCurrency?: string;
        shippingDetails?: unknown;
      }
    | Array<{
        price?: string | number;
        lowPrice?: string | number;
        priceCurrency?: string;
      }>;
};

function asImageList(image: JsonLdProduct["image"]): string[] {
  if (!image) return [];
  if (typeof image === "string") return [image];
  if (Array.isArray(image)) {
    return image
      .map((item) => (typeof item === "string" ? item : item?.url || ""))
      .filter(Boolean);
  }
  return [];
}

function walkJsonLd(node: unknown, out: JsonLdProduct[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const typ = obj["@type"];
  const types = Array.isArray(typ) ? typ.map(String) : typ ? [String(typ)] : [];
  if (types.some((t) => /product/i.test(t))) {
    out.push(obj as JsonLdProduct);
  }
  if (obj["@graph"]) walkJsonLd(obj["@graph"], out);
}

function extractJsonLdProducts(html: string): JsonLdProduct[] {
  const products: JsonLdProduct[] = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      walkJsonLd(JSON.parse(raw), products);
    } catch {
      /* ignore malformed blocks */
    }
  }
  return products;
}

function offerPrice(product: JsonLdProduct): string | null {
  const offers = product.offers;
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  for (const offer of list) {
    const price = formatPrice(offer.price ?? offer.lowPrice, offer.priceCurrency);
    if (price) return price;
  }
  return null;
}

function brandFromProduct(product: JsonLdProduct): string | null {
  const b = product.brand;
  if (!b) return null;
  if (typeof b === "string") return b.trim().slice(0, 80) || null;
  if (typeof b === "object" && b.name) return String(b.name).trim().slice(0, 80) || null;
  return null;
}

function metaTag(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

async function tryFetchHtml(url: string): Promise<string | null> {
  try {
    const safe = assertPublicHttpUrl(url);
    const res = await fetch(safe.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.slice(0, 2_000_000);
  } catch {
    return null;
  }
}

/**
 * Rehost the full unique gallery. Cover = first; screenshots = rest.
 * candidateImages uses the same ordered URLs (rehosted when possible).
 */
async function rehostGallery(
  urls: string[],
  slug: string
): Promise<{ cover: string | null; shots: string[]; candidates: string[] }> {
  const clean = dedupeProductImages(urls, MAX_GALLERY_IMAGES);
  if (!clean.length) return { cover: null, shots: [], candidates: [] };

  const gearSlug = `gear-${slug || "import"}`.slice(0, 80);
  const hosted: string[] = [];

  for (let i = 0; i < clean.length; i++) {
    const src = clean[i];
    const kind = i === 0 ? "cover" : `shot-${i - 1}`;
    const url =
      (await rehostImageToBlob({ sourceUrl: src, slug: gearSlug, kind })) || src;
    if (url && !hosted.includes(url)) hosted.push(url);
  }

  const cover = hosted[0] || null;
  const shots = hosted.slice(1);
  return { cover, shots, candidates: hosted };
}

function mergeUniqueUrls(...lists: string[][]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const u of list) {
      if (u && !out.includes(u)) out.push(u);
    }
  }
  return out;
}

/**
 * Build a gear draft from an affiliate / product URL.
 * Always keeps the pasted URL as the affiliate link destination.
 */
export async function importGearFromUrl(rawUrl: string): Promise<GearImportResult> {
  const url = assertPublicHttpUrl(rawUrl).toString();
  const warnings: string[] = [];
  const amazon = isAmazonProductUrl(url);

  const [metaResult, html] = await Promise.all([tryFetchPageMeta(url), tryFetchHtml(url)]);

  let title = "";
  let description = "";
  let images: string[] = [];
  let siteName: string | null = null;
  let price: string | null = null;
  let shipping: string | null = null;
  let manufacturer: string | null = null;
  let category: GearCategory | null = null;
  let platforms: string[] = [];
  let videos: string[] = [];

  if (html && amazon) {
    const parsed = parseAmazonProduct(html);
    if (parsed.title) title = parsed.title;
    if (parsed.description) description = parsed.description;
    if (parsed.price) price = parsed.price;
    if (parsed.shipping) shipping = parsed.shipping;
    if (parsed.manufacturer) manufacturer = parsed.manufacturer;
    if (parsed.category) category = parsed.category;
    platforms = parsed.platforms;
    videos = parsed.videos;
    images = parsed.images;
  }

  if (html) {
    const products = extractJsonLdProducts(html);
    const product = products[0];
    if (product) {
      if (!title && product.name) title = String(product.name).trim().slice(0, 200);
      if (!description && product.description) {
        description = stripHtml(String(product.description)).slice(0, 8000);
      }
      if (!manufacturer) manufacturer = brandFromProduct(product);
      images = mergeUniqueUrls(images, asImageList(product.image));
      if (!price) price = offerPrice(product);
    }

    if (!price) {
      const amount =
        metaTag(html, "product:price:amount") ||
        metaTag(html, "og:price:amount") ||
        metaTag(html, "twitter:data1");
      const currency =
        metaTag(html, "product:price:currency") || metaTag(html, "og:price:currency");
      if (amount) {
        price = /\$|€|£/.test(amount)
          ? amount.slice(0, 40)
          : formatPrice(amount, currency);
      }
    }
  }

  if (metaResult.ok) {
    const meta = metaResult.meta;
    siteName = meta.siteName;
    if (!title && meta.title) title = meta.title;
    if (!description && meta.description) description = meta.description;
    images = mergeUniqueUrls(images, meta.images);
  } else {
    warnings.push(metaResult.message);
  }

  if (!title) title = softTitleFromUrl(url);
  if (!description) description = "";

  if (!amazon) {
    title = title
      .replace(/\s*[|\-–—]\s*Amazon\..*$/i, "")
      .replace(/^Buy\s+/i, "")
      .trim()
      .slice(0, 200);
  } else {
    title = title.trim().slice(0, 200);
  }

  if (amazon && !shipping) shipping = "Prime / usually 1–2 days";

  const slug = slugifyTitle(title).slice(0, 80) || "gear-item";
  const retailer = detectRetailer(url, siteName);
  const uniqueImages = dedupeProductImages(images, MAX_GALLERY_IMAGES);
  const { cover, shots, candidates } = await rehostGallery(uniqueImages, slug);

  if (!price) warnings.push("No price found on the page — you can enter it manually.");
  if (!cover && candidates.length === 0) warnings.push("No product image found.");

  const affiliate: GearImportAffiliate = {
    retailer,
    url,
    price,
    shipping,
    isActive: true,
  };

  return {
    ok: true,
    draft: {
      title,
      slug,
      description,
      category,
      coverImage: cover,
      screenshots: shots,
      manufacturer,
      platforms,
      videos,
      candidateImages: candidates,
      affiliateLinks: [affiliate],
    },
    retailer,
    price,
    warnings,
  };
}
