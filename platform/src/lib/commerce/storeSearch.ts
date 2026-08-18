/**
 * Search a store catalog by game title.
 *
 * API stores hit the storefront. Feed stores search the last ingested product
 * list. Manual stores return nothing — paste a URL on the game instead.
 */

import { lookupStorePrice } from "@/lib/access/storePrices";
import { normalizeTitle } from "@/lib/freeOffers/matching";
import StoreFeedProduct from "@/lib/models/StoreFeedProduct";
import { STORE_CAPABILITIES, storeSlugToRetailer, type CommerceStoreSlug } from "./stores";

const UA = "PlayBoundAdmin/1.0";

export type StoreSearchHit = {
  store: CommerceStoreSlug;
  retailer: string;
  title: string;
  url: string;
  externalId: string;
  priceCents: number | null;
  listPriceCents: number | null;
};

function scoreHit(gameTitle: string, hitTitle: string): number {
  const want = normalizeTitle(gameTitle);
  const got = normalizeTitle(hitTitle);
  if (!want || !got) return 0;
  if (want === got) return 100;
  if (got.startsWith(want) || want.startsWith(got)) return 80;
  if (got.includes(want) || want.includes(got)) return 60;
  return 10;
}

function rank(gameTitle: string, hits: StoreSearchHit[]): StoreSearchHit[] {
  return hits
    .map((hit) => ({ hit, score: scoreHit(gameTitle, hit.title) }))
    .filter((row) => row.score >= 60)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.hit);
}

async function searchSteam(title: string): Promise<StoreSearchHit[]> {
  const url = new URL("https://store.steampowered.com/api/storesearch/");
  url.searchParams.set("term", title);
  url.searchParams.set("l", "english");
  url.searchParams.set("cc", "US");
  const res = await fetch(url, { headers: { "user-agent": UA }, next: { revalidate: 0 } });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    items?: Array<{ id?: number; name?: string; price?: { final?: number; initial?: number } }>;
  };
  const hits: StoreSearchHit[] = [];
  for (const item of json.items ?? []) {
    if (!item.id || !item.name) continue;
    const live = typeof item.price?.final === "number" ? item.price.final : null;
    const list = typeof item.price?.initial === "number" ? item.price.initial : live;
    hits.push({
      store: "steam",
      retailer: "Steam",
      title: item.name,
      url: `https://store.steampowered.com/app/${item.id}`,
      externalId: String(item.id),
      priceCents: live && live > 0 ? live : null,
      listPriceCents: list && list > 0 ? list : live,
    });
  }
  return rank(title, hits);
}

function dollarsToCents(raw: unknown): number | null {
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }
  return null;
}

async function searchGog(title: string): Promise<StoreSearchHit[]> {
  const catalog = new URL("https://catalog.gog.com/v1/catalog");
  catalog.searchParams.set("limit", "8");
  catalog.searchParams.set("query", title);
  catalog.searchParams.set("productType", "in:game,pack");
  catalog.searchParams.set("countryCode", "US");
  catalog.searchParams.set("locale", "en-US");
  catalog.searchParams.set("currencyCode", "USD");
  const res = await fetch(catalog, { headers: { "user-agent": UA }, next: { revalidate: 0 } });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    products?: Array<{
      id?: string | number;
      slug?: string;
      title?: string;
      storeLink?: string;
      price?: { finalMoney?: { amount?: string }; baseMoney?: { amount?: string }; isFree?: boolean };
    }>;
  };
  const hits: StoreSearchHit[] = [];
  for (const p of json.products ?? []) {
    if (!p.title || p.price?.isFree) continue;
    const live = dollarsToCents(p.price?.finalMoney?.amount);
    const list = dollarsToCents(p.price?.baseMoney?.amount);
    const slug = p.slug || "";
    hits.push({
      store: "gog",
      retailer: "GOG",
      title: p.title,
      url: p.storeLink || (slug ? `https://www.gog.com/game/${slug}` : ""),
      externalId: String(p.id ?? slug),
      priceCents: live && live > 0 ? live : null,
      listPriceCents: list && list > 0 ? list : live,
    });
  }
  return rank(
    title,
    hits.filter((h) => h.url)
  );
}

type EpicSearchElement = {
  title?: string;
  productSlug?: string;
  urlSlug?: string;
  catalogNs?: { mappings?: { pageSlug?: string }[] };
  offerMappings?: { pageSlug?: string }[];
  price?: { totalPrice?: { discountPrice?: number; originalPrice?: number } };
};

function epicSlug(el: EpicSearchElement): string {
  return (
    el.catalogNs?.mappings?.[0]?.pageSlug ||
    el.offerMappings?.[0]?.pageSlug ||
    el.productSlug?.replace(/\/.*$/, "") ||
    el.urlSlug ||
    ""
  );
}

async function searchEpic(title: string): Promise<StoreSearchHit[]> {
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
      variables: { keywords: title },
    }),
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: { Catalog?: { searchStore?: { elements?: EpicSearchElement[] } } };
  };
  const hits: StoreSearchHit[] = [];
  for (const el of json.data?.Catalog?.searchStore?.elements ?? []) {
    const slug = epicSlug(el);
    if (!el.title || !slug) continue;
    const live = el.price?.totalPrice?.discountPrice;
    const list = el.price?.totalPrice?.originalPrice;
    hits.push({
      store: "epic",
      retailer: "Epic Games Store",
      title: el.title,
      url: `https://store.epicgames.com/p/${slug}`,
      externalId: slug,
      priceCents: typeof live === "number" && live > 0 ? live : null,
      listPriceCents: typeof list === "number" && list > 0 ? list : live ?? null,
    });
  }
  return rank(title, hits);
}

async function searchFanatical(title: string): Promise<StoreSearchHit[]> {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  if (!slug) return [];
  try {
    const live = await lookupStorePrice(`https://www.fanatical.com/en/game/${slug}`);
    return rank(title, [
      {
        store: "fanatical",
        retailer: "Fanatical",
        title,
        url: live.url,
        externalId: slug,
        priceCents: live.priceCents,
        listPriceCents: live.listPriceCents,
      },
    ]);
  } catch {
    return [];
  }
}

async function searchFeed(store: CommerceStoreSlug, title: string): Promise<StoreSearchHit[]> {
  const retailer = storeSlugToRetailer(store);
  if (!retailer) return [];
  const docs = await StoreFeedProduct.find({ store }).select("title url externalId priceCents listPriceCents").lean();
  const hits: StoreSearchHit[] = docs.map((d) => ({
    store,
    retailer,
    title: String(d.title),
    url: String(d.url),
    externalId: String(d.externalId),
    priceCents: typeof d.priceCents === "number" ? d.priceCents : null,
    listPriceCents: typeof d.listPriceCents === "number" ? d.listPriceCents : null,
  }));
  return rank(title, hits).slice(0, 8);
}

export function scoreTitleMatch(gameTitle: string, hitTitle: string): number {
  return scoreHit(gameTitle, hitTitle);
}

export async function searchStoreCatalog(
  store: CommerceStoreSlug,
  title: string
): Promise<StoreSearchHit[]> {
  const caps = STORE_CAPABILITIES[store];
  if (caps.titleSearch) {
    const hits =
      store === "steam"
        ? await searchSteam(title)
        : store === "gog"
          ? await searchGog(title)
          : store === "epic"
            ? await searchEpic(title)
            : store === "fanatical"
              ? await searchFanatical(title)
              : [];
    if (hits.length > 0) return hits;
  }
  if (caps.feedIngest) return searchFeed(store, title);
  return [];
}
