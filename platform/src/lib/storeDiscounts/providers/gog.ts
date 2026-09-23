import type { DiscountProviderAdapter, DiscoveredDiscount } from "../types";
import { cleanDealTitle } from "@/lib/dealsShared";

/**
 * GOG deep-discount adapter.
 *
 * `catalog.gog.com/v1/catalog` is GOG's own public storefront search API — no
 * auth, no key, and it exposes exact live pricing and discount percentage
 * directly, unlike GOG's free-offer adapter (`freeOffers/providers/gog.ts`),
 * which only ever sees $0 giveaways and has no discount logic at all. This is
 * a separate, new capability, not a reuse of that file.
 *
 * `order=desc:discount` sorts deepest-cut first, which is what lets this stay
 * bounded: GOG has roughly 3,500 products discounted at any given time, and we
 * do not want to page through all of them. Pagination stops the moment a
 * page's *minimum* discount drops below the threshold — everything after that
 * point can only be shallower.
 */

const GOG_CATALOG_URL = "https://catalog.gog.com/v1/catalog";
const PAGE_SIZE = 48;
/** Refuse to run away against an API quirk — 10 pages is already generous headroom. */
const MAX_PAGES = 10;

type GogPrice = {
  discount?: string; // "-95%"
  finalMoney?: { amount?: string; currency?: string };
  baseMoney?: { amount?: string };
};

type GogGenre = { name?: string; slug?: string };
type GogRating = { name?: string; ageRating?: string };

type GogCatalogProduct = {
  id?: string;
  slug?: string;
  title?: string;
  storeLink?: string;
  coverHorizontal?: string;
  coverVertical?: string;
  developers?: string[];
  operatingSystems?: string[];
  genres?: GogGenre[];
  tags?: GogGenre[];
  price?: GogPrice;
  ratings?: GogRating[];
};

type GogCatalogResponse = {
  pages?: number;
  products?: GogCatalogProduct[];
};

/** "-95%" → 95. Absent/unparseable → null, never a guessed 0. */
function parseDiscountPercent(discount: string | undefined): number | null {
  if (!discount) return null;
  const m = /(\d+)/.exec(discount);
  return m ? Number.parseInt(m[1], 10) : null;
}

/** "$1.49" / "1.49" → 149 cents. */
function parseDollarsToCents(amount: string | undefined): number | null {
  if (!amount) return null;
  const n = Number.parseFloat(amount.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function mapPlatforms(operatingSystems: string[] | undefined): string[] {
  const map: Record<string, string> = { windows: "Windows", osx: "macOS", linux: "Linux" };
  return (operatingSystems ?? []).map((os) => map[os.toLowerCase()] ?? os).filter(Boolean);
}

/**
 * PlayBound is a general-audience catalog. GOG's own 18+ rating and its
 * mature/NSFW/sexual-content/nudity tags are the signal it publishes for
 * exactly this — use it rather than inventing a content filter of our own.
 * Best-effort: a product with no rating data at all is let through, since an
 * absence is not evidence of anything.
 */
function isMatureContent(product: GogCatalogProduct): boolean {
  if ((product.ratings ?? []).some((r) => r.ageRating === "18")) return true;
  const flagged = new Set(["mature", "nsfw", "sexual-content", "nudity"]);
  return (product.tags ?? []).some((t) => t.slug && flagged.has(t.slug));
}

function toDiscoveredDiscount(product: GogCatalogProduct): DiscoveredDiscount | null {
  if (!product.id || !product.title) return null;
  if (isMatureContent(product)) return null;

  const percentOff = parseDiscountPercent(product.price?.discount);
  const currentPriceCents = parseDollarsToCents(product.price?.finalMoney?.amount);
  const regularPriceCents = parseDollarsToCents(product.price?.baseMoney?.amount);
  if (percentOff === null || currentPriceCents === null || regularPriceCents === null) return null;
  // Belongs in the free half, not here — see the dedup note in ingestion.ts.
  if (currentPriceCents === 0) return null;

  const storeUrl =
    product.storeLink ||
    (product.slug ? `https://www.gog.com/en/game/${product.slug}` : null);
  if (!storeUrl) return null;

  return {
    externalId: String(product.id),
    title: cleanDealTitle(product.title),
    store: "gog",
    storeUrl,
    coverImage: product.coverHorizontal || product.coverVertical || null,
    genres: (product.genres ?? []).map((g) => g.name).filter((n): n is string => Boolean(n)),
    developers: product.developers ?? [],
    platforms: mapPlatforms(product.operatingSystems),
    currency: product.price?.finalMoney?.currency || "USD",
    regularPriceCents,
    currentPriceCents,
    metadata: { gogId: product.id, gogSlug: product.slug, discountPercentRaw: product.price?.discount },
  };
}

async function fetchPage(page: number): Promise<GogCatalogResponse> {
  const url = new URL(GOG_CATALOG_URL);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("discounted", "true");
  url.searchParams.set("order", "desc:discount");
  url.searchParams.set("page", String(page));
  url.searchParams.set("countryCode", "US");
  url.searchParams.set("currencyCode", "USD");
  url.searchParams.set("locale", "en-US");

  const res = await fetch(url.toString(), {
    headers: { "user-agent": "PlayBoundIngestion/1.0", accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`GOG catalog returned HTTP ${res.status}`);
  return (await res.json()) as GogCatalogResponse;
}

export class GogDiscountAdapter implements DiscountProviderAdapter {
  readonly store = "gog" as const;

  async fetchDiscounts(minPercentOff: number): Promise<DiscoveredDiscount[]> {
    const found: DiscoveredDiscount[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await fetchPage(page);
      const products = data.products ?? [];
      if (products.length === 0) break;

      let sawBelowThreshold = false;
      for (const product of products) {
        const rawPercent = parseDiscountPercent(product.price?.discount) ?? 0;
        if (rawPercent < minPercentOff) {
          // Sorted deepest-first: once one item on a page is below the bar,
          // nothing after it on this or any later page can clear it either.
          sawBelowThreshold = true;
          break;
        }
        const mapped = toDiscoveredDiscount(product);
        if (mapped) found.push(mapped);
      }

      if (sawBelowThreshold) break;
      if (page >= (data.pages ?? page)) break;
    }

    return found;
  }
}
