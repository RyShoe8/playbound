import type { DiscountProviderAdapter, DiscoveredDiscount, DiscountStoreSlug } from "../types";

/**
 * CheapShark deal-aggregator adapter — covers Steam, Epic and GamersGate.
 *
 * CheapShark (cheapshark.com/api-docs) is a free, no-key aggregator across
 * ~14 storefronts. GOG isn't read through it — GOG has its own clean official
 * API (see providers/gog.ts) and reading it twice would double-count. Only
 * three of CheapShark's stores are wired here; see
 * STORE_CAPABILITIES[x].discountScan in src/lib/commerce/stores.ts for why
 * Humble/Fanatical/Green Man Gaming (also on CheapShark) are deferred.
 *
 * storeID map, confirmed live against /api/1.0/stores: 1=Steam, 2=GamersGate,
 * 25=Epic Games Store.
 *
 * **The link-building problem, and why it differs per store.** Checked
 * directly against CheapShark's own /deals and /games detail endpoints:
 * neither ever returns a direct Epic or GamersGate product URL — only their
 * own redirect (`dealID`) and, usefully, a `steamAppID` cross-reference even
 * on non-Steam deals.
 *   - Steam: build our own direct product URL from `steamAppID`.
 *   - GamersGate: PlayBound has a **live affiliate program** here
 *     (`aff` param). CheapShark's redirect is not a gamersgate.com URL, so it
 *     cannot carry that stamp — using it would silently divert a real
 *     commission to CheapShark instead of us. Their own site search
 *     (`gamersgate.com/games/?query=`) does return exact `/product/<slug>/`
 *     pages for an exact title, confirmed live, so this resolves the real
 *     product URL from GamersGate's own domain — always first-party, always
 *     affiliate-wrappable — falling back to the plain search results page
 *     (still first-party, still wrappable, just one click short of exact)
 *     only if resolution fails for a specific title.
 *   - Epic: no affiliate program exists for this store yet, so there is
 *     nothing to protect. Falls back to CheapShark's own redirect — the only
 *     option left — and `service.ts` must never affiliate-wrap it
 *     (`metadata.directUrlAvailable: false`). Revisit this store the same way
 *     GamersGate was just fixed if an Epic affiliate is ever configured.
 */

const CHEAPSHARK_DEALS_URL = "https://www.cheapshark.com/api/1.0/deals";
/*
 * CheapShark requires a descriptive User-Agent — confirmed live: a missing or
 * generic one gets a 403 with an explicit message asking for one.
 */
const USER_AGENT = "PlayBoundIngestion/1.0 (+https://playbound.club)";
const PAGE_SIZE = 60;
const GAMERSGATE_SEARCH_TIMEOUT_MS = 8_000;

const CHEAPSHARK_STORE_IDS: Record<Extract<DiscountStoreSlug, "steam" | "epic" | "gamersgate">, string> = {
  steam: "1",
  gamersgate: "2",
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

function gamersGateSearchUrl(title: string): string {
  return `https://www.gamersgate.com/games/?query=${encodeURIComponent(title)}`;
}

/** "Elden Ring: Shadow of the Erdtree" → "elden-ring-shadow-of-the-erdtree", for comparing against a GamersGate slug. */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve the exact GamersGate product page for a title via their own site
 * search — first-party, no CheapShark involvement.
 *
 * Takes every `/product/<slug>/` link on the results page and prefers one
 * whose slug matches the title exactly, rather than the first result — a
 * search for "Elden Ring" returns "elden-ring-nightreign" (a different game)
 * before "elden-ring" (the one asked for), confirmed live, so "first result"
 * would silently point the deal at the wrong product. Falls back to the first
 * result only when nothing matches exactly, which is still a plausible,
 * first-party destination for the query — just not guaranteed to be the exact
 * edition.
 *
 * Best-effort throughout: a network failure, timeout, or a search page whose
 * markup has changed all fall through to `null` rather than throwing, because
 * one unresolvable title must never fail the whole store's ingestion run —
 * see the caller in `fetchDiscounts`.
 */
async function resolveGamersGateProductUrl(title: string): Promise<string | null> {
  try {
    const res = await fetch(gamersGateSearchUrl(title), {
      headers: { "user-agent": USER_AGENT },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(GAMERSGATE_SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const slugs = [...html.matchAll(/href="\/product\/([a-z0-9-]+)\/"/gi)].map((m) => m[1]);
    if (slugs.length === 0) return null;

    const wanted = titleToSlug(title);
    const exact = slugs.find((s) => s.toLowerCase() === wanted);
    return `https://www.gamersgate.com/product/${exact ?? slugs[0]}/`;
  } catch {
    return null;
  }
}

/**
 * CheapShark's `redirect` endpoint. Documented, stable, and — unlike scraping
 * a store's own search results — always lands on the exact deal, which is why
 * it is still the right fallback for Epic specifically (see the module doc):
 * no affiliate program exists there to protect, so the convenience wins.
 * Never used for GamersGate, and never wrapped in our own affiliate template.
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

  constructor(store: Extract<DiscountStoreSlug, "steam" | "epic" | "gamersgate">) {
    this.store = store;
  }

  async fetchDiscounts(minPercentOff: number): Promise<DiscoveredDiscount[]> {
    const url = new URL(CHEAPSHARK_DEALS_URL);
    url.searchParams.set("storeID", CHEAPSHARK_STORE_IDS[this.store as "steam" | "epic" | "gamersgate"]);
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
      } else if (base.store === "gamersgate") {
        // Sequential, not Promise.all — a small handful of ≥75%-off titles
        // per run in practice (sampled live at ~52 of 60 unsorted deals
        // across all three stores combined), and this store's link must be
        // correct far more than it must be fast.
        const resolved = await resolveGamersGateProductUrl(base.title);
        storeUrl = resolved ?? gamersGateSearchUrl(base.title);
        // Both branches are first-party gamersgate.com URLs, so both are
        // affiliate-wrappable — the fallback only costs the user one extra
        // click, never the commission.
        directUrlAvailable = true;
      } else {
        storeUrl = cheapSharkRedirectUrl(base.dealId);
        directUrlAvailable = false;
      }

      out.push({
        externalId: base.dealId,
        title: base.title,
        store: base.store,
        storeUrl,
        coverImage: deal.thumb || null,
        // CheapShark's deal listing carries no genre/developer/platform data —
        // this feed trades that off for covering three stores in one call.
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
  store: Extract<DiscountStoreSlug, "steam" | "epic" | "gamersgate">
): CheapSharkDiscountAdapter {
  return new CheapSharkDiscountAdapter(store);
}
