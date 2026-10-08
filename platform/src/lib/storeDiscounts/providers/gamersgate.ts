import type { DiscountProviderAdapter, DiscoveredDiscount } from "../types";
import { cleanDealTitle } from "@/lib/dealsShared";

const OFFERS_URL = "https://www.gamersgate.com/offers/";
// The offers page is not sorted by discount. Scan several pages rather than
// stopping at the first sub-75% card; keep the cron's 60-second budget in mind.
const MAX_PAGES = 6;
const TIMEOUT_MS = 10_000;

function decodeHtml(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|quot|apos|lt|gt|nbsp|#x27);/gi, (match, entity: string) => {
    const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", "#x27": "'" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    if (entity.startsWith("#")) {
      const code = entity[1].toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    return match;
  });
}

function attribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`, "i"));
  return match ? decodeHtml(match[1]) : null;
}

function cents(price: string | null): number | null {
  if (!price || !/^\d+(?:\.\d{1,2})?$/.test(price)) return null;
  return Math.round(Number(price) * 100);
}

/** Parse GamersGate's own sale cards. A missing card layout is an ingestion failure, not zero deals. */
export function parseGamersGateOffers(html: string, minPercentOff: number): DiscoveredDiscount[] {
  const starts = [...html.matchAll(/<div class="column catalog-item product--item"[^>]*>/g)];
  if (starts.length === 0) throw new Error("GamersGate offers page has no product cards");

  const results: DiscoveredDiscount[] = [];
  for (let i = 0; i < starts.length; i++) {
    const tag = starts[i][0];
    const body = html.slice(starts[i].index, starts[i + 1]?.index ?? html.length);
    const id = attribute(tag, "data-id");
    const name = attribute(tag, "data-name");
    const path = attribute(tag, "data-url");
    const currency = attribute(tag, "data-currency");
    const currentPriceCents = cents(attribute(tag, "data-price"));
    const regularPriceCents = cents(body.match(/catalog-item--full-price">\$\s*([\d,.]+)/)?.[1]?.replace(/,/g, "") ?? null);
    const image = body.match(/catalog-item--image[^>]*>[\s\S]*?<img\s+src="([^"]+)"/i)?.[1] ?? null;
    const age = body.match(/data-required-age="([^"]+)"/)?.[1];

    if (!id || !name || !path?.startsWith("/product/") || !/^\/product\/[a-z0-9-]+\/$/i.test(path)) continue;
    if (currency !== "USD" || !currentPriceCents || !regularPriceCents || age === "18") continue;
    const percentOff = Math.floor(((regularPriceCents - currentPriceCents) / regularPriceCents) * 100);
    if (percentOff < minPercentOff) continue;

    results.push({
      externalId: id,
      title: cleanDealTitle(name),
      store: "gamersgate",
      storeUrl: new URL(path, OFFERS_URL).toString(),
      coverImage: image?.startsWith("https://sttc.gamersgate.com/") ? decodeHtml(image) : null,
      genres: [],
      developers: [],
      platforms: [],
      currency: "USD",
      regularPriceCents,
      currentPriceCents,
      metadata: { directUrlAvailable: true, source: "gamersgate-offers" },
    });
  }
  return results;
}

export class GamersGateDiscountAdapter implements DiscountProviderAdapter {
  readonly store = "gamersgate" as const;

  async fetchDiscounts(minPercentOff: number): Promise<DiscoveredDiscount[]> {
    const loadPage = async (page: number): Promise<string> => {
      const url = page === 1 ? OFFERS_URL : `${OFFERS_URL}?page=${page}`;
      const res = await fetch(url, {
        headers: { "user-agent": "PlayBoundIngestion/1.0 (+https://playbound.club)", accept: "text/html" },
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`GamersGate returned HTTP ${res.status} on page ${page}`);
      return res.text();
    };

    const firstPage = await loadPage(1);
    const pages = Math.min(
      MAX_PAGES,
      Math.max(1, ...[...firstPage.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1])))
    );
    const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => loadPage(i + 2)));
    const found = [firstPage, ...rest].flatMap((html) => parseGamersGateOffers(html, minPercentOff));
    return [...new Map(found.map((deal) => [deal.externalId, deal])).values()];
  }
}
