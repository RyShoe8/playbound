import type { DiscountProviderAdapter, DiscoveredDiscount, DiscountStoreSlug } from "../types";
import { cleanDealTitle, upgradeCoverImage } from "@/lib/dealsShared";

/**
 * CheapShark deal-aggregator adapter — covers Steam and Epic.
 *
 * CheapShark (cheapshark.com/api-docs) is a free, no-key aggregator across
 * ~14 storefronts. GOG isn't read through it — GOG has its own clean official
 * API (see providers/gog.ts) and reading it twice would double-count. Only
 * two of CheapShark's stores are wired here; see
 * STORE_CAPABILITIES[x].discountScan in src/lib/commerce/stores.ts for why
 * Humble/Fanatical/Green Man Gaming (also on CheapShark) are deferred.
 *
 * storeID map, confirmed live against /api/1.0/stores: 1=Steam,
 * 25=Epic Games Store. GamersGate uses its own sale page adapter because
 * CheapShark's GamersGate feed repeatedly timed out.
 *
 * **The link-building problem, and why it differs per store.** Checked
 * directly against CheapShark's own /deals and /games detail endpoints:
 * neither ever returns a direct Epic product URL — only its
 * own redirect (`dealID`) and, usefully, a `steamAppID` cross-reference even
 * on non-Steam deals.
 *   - Steam: build our own direct product URL from `steamAppID`.
 *   - Epic: no affiliate program exists for this store yet, so there is
 *     nothing to protect. Falls back to CheapShark's own redirect — the only
 *     option left — and `service.ts` must never affiliate-wrap it
 *     (`metadata.directUrlAvailable: false`). Revisit this store the same way
 *     GamersGate was if an Epic affiliate is ever configured.
 */

const CHEAPSHARK_DEALS_URL = "https://www.cheapshark.com/api/1.0/deals";
/*
 * CheapShark requires a descriptive User-Agent — confirmed live: a missing or
 * generic one gets a 403 with an explicit message asking for one.
 */
const USER_AGENT = "PlayBoundIngestion/1.0 (+https://playbound.club)";
const PAGE_SIZE = 60;
const CHEAPSHARK_STORE_IDS: Record<Extract<DiscountStoreSlug, "steam" | "epic">, string> = {
  steam: "1",
  epic: "25",
};
type CheapSharkDeal = {
  dealID?: string;
  title?: string;
  storeID?: string;
  gameID?: string;
  salePrice?: string;
  normalPrice?: string;
  steamAppID?: string | null;
  thumb?: string;
};

function toCents(dollars: string | undefined): number | null {
  if (!dollars) return null;
  const n = Number.parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function steamStoreUrl(appId: string): string {
  return `https://store.steampowered.com/app/${appId}/`;
}

/**
 * CheapShark's `redirect` endpoint. Documented, stable, and — unlike scraping
 * a store's own search results — always lands on the exact deal, which is why
 * it is still the right fallback for Epic specifically (see the module doc):
 * no affiliate program exists there to protect, so the convenience wins.
 * Never wrapped in our own affiliate template.
 */
function cheapSharkRedirectUrl(dealId: string): string {
  return `https://www.cheapshark.com/redirect?dealID=${dealId}`;
}

function baseFields(deal: CheapSharkDeal, minPercentOff: number, store: DiscountStoreSlug) {
  if (!deal.dealID || !deal.title) return null;
  const currentPriceCents = toCents(deal.salePrice);
  const regularPriceCents = toCents(deal.normalPrice);
  if (currentPriceCents === null || regularPriceCents === null) return null;
  // Belongs in the free half, not here — see ingestion.ts's dedup note. Also
  // catches Epic's current weekly free titles, which this feed otherwise
  // reports as "100% off".
  if (currentPriceCents === 0 || regularPriceCents <= 0) return null;

  const percentOff = Math.floor(((regularPriceCents - currentPriceCents) / regularPriceCents) * 100);
  if (percentOff < minPercentOff) return null;

  return { store, currentPriceCents, regularPriceCents, dealId: deal.dealID, title: deal.title.trim() };
}

export class CheapSharkDiscountAdapter implements DiscountProviderAdapter {
  readonly store: DiscountStoreSlug;

  constructor(store: Extract<DiscountStoreSlug, "steam" | "epic">) {
    this.store = store;
  }

  async fetchDiscounts(minPercentOff: number): Promise<DiscoveredDiscount[]> {
    const url = new URL(CHEAPSHARK_DEALS_URL);
    url.searchParams.set("storeID", CHEAPSHARK_STORE_IDS[this.store as "steam" | "epic"]);
    url.searchParams.set("onSale", "1");
    url.searchParams.set("pageSize", String(PAGE_SIZE));

    const res = await fetch(url.toString(), {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`CheapShark returned HTTP ${res.status} for ${this.store}`);

    const deals = (await res.json()) as CheapSharkDeal[];
    if (!Array.isArray(deals)) throw new Error(`CheapShark returned an unexpected shape for ${this.store}`);

    const out: DiscoveredDiscount[] = [];
    for (const deal of deals) {
      const base = baseFields(deal, minPercentOff, this.store);
      if (!base) continue;

      let storeUrl: string;
      let directUrlAvailable: boolean;

      if (base.store === "steam" && deal.steamAppID) {
        storeUrl = steamStoreUrl(deal.steamAppID);
        directUrlAvailable = true;
      } else {
        storeUrl = cheapSharkRedirectUrl(base.dealId);
        directUrlAvailable = false;
      }

      out.push({
        externalId: base.dealId,
        title: cleanDealTitle(base.title),
        store: base.store,
        storeUrl,
        coverImage: upgradeCoverImage(deal.thumb, deal.steamAppID),
        // CheapShark's deal listing carries no genre/developer/platform data —
        // this feed trades that off for covering two stores in one call.
        genres: [],
        developers: [],
        platforms: [],
        currency: "USD",
        regularPriceCents: base.regularPriceCents,
        currentPriceCents: base.currentPriceCents,
        metadata: {
          cheapSharkDealId: deal.dealID,
          cheapSharkGameId: deal.gameID,
          steamAppID: deal.steamAppID || null,
          directUrlAvailable,
        },
      });
    }
    return out;
  }
}

/** One adapter per CheapShark-backed store, for the ingestion loop to pick from. */
export function createCheapSharkAdapter(
  store: Extract<DiscountStoreSlug, "steam" | "epic">
): CheapSharkDiscountAdapter {
  return new CheapSharkDiscountAdapter(store);
}
