/**
 * Amazon Prime Gaming ingestion adapter.
 *
 * Prime Gaming moved under Amazon Luna: gaming.amazon.com now redirects to
 * luna.amazon.com/claims, and the offer list is rendered client-side from a
 * GraphQL call rather than served in the HTML. A plain POST to that endpoint
 * is rejected with HTTP 403.
 *
 * It is reachable anonymously, though, and that is what this adapter does —
 * exactly the handshake any logged-out browser performs:
 *
 *   1. GET the public claims page. Amazon sets `session-id` cookies and embeds
 *      a per-session CSRF token in the markup as `csrf-key`.
 *   2. POST the page's own `FeaturedContent` operation back to /graphql with
 *      that token in the `csrf-token` header (that exact header name — the
 *      usual `x-csrf-token` spelling is still rejected) and the cookies.
 *
 * No Amazon account, no stored credentials, no user data: the token is a
 * public anti-forgery value handed to every anonymous visitor, and everything
 * read here is what a logged-out visitor sees. Offers still require a Prime
 * subscription to *claim*, hence `free_with_subscription`.
 *
 * Two collections are read and merged. `FREE_GAMES` is the full claimable
 * list (16 titles at the time of writing); `FEATURED_CONTENT` is the promoted
 * carousel, a near-subset kept because it occasionally leads with something
 * before the main list picks it up. Items are de-duplicated by Amazon's item
 * id. The schema has introspection stripped, so these enum names were
 * established by probing and are pinned here deliberately — if Amazon renames
 * one, that collection yields a validation error and is skipped rather than
 * taking the whole pull down.
 */

import type { StoreProviderAdapter, DiscoveredOffer } from "./types";

const CLAIMS_PAGE = "https://luna.amazon.com/claims/home?g=s";
const GRAPHQL_URL = "https://luna.amazon.com/graphql";

/** Matches a logged-out desktop browser; Amazon 403s unknown clients. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Collections to read, in priority order. The first is the complete claimable
 * list; the second is the promoted carousel, merged for early arrivals.
 */
const COLLECTIONS = ["FREE_GAMES", "FEATURED_CONTENT"] as const;

/** The operation the claims page itself issues, trimmed to fields we map. */
const contentQuery = (collection: string) => `query FeaturedContent($pageSize: Int) {
  items(collectionType: ${collection}, pageSize: $pageSize) {
    items {
      id
      isFGWP
      category
      assets {
        id
        title
        shortformDescription
        externalClaimLink
        cardMedia { defaultMedia { src2x } }
      }
      game { id assets { title } }
    }
  }
}`;

type LunaMedia = { defaultMedia?: { src2x?: string | null } | null } | null;

type LunaItem = {
  id?: string;
  isFGWP?: boolean;
  category?: string | null;
  assets?: {
    id?: string;
    title?: string;
    shortformDescription?: string | null;
    externalClaimLink?: string | null;
    cardMedia?: LunaMedia;
  } | null;
  game?: { id?: string; assets?: { title?: string } | null } | null;
};

type LunaResponse = {
  data?: { items?: { items?: LunaItem[] } | null } | null;
  errors?: { message?: string }[];
};

/** Pull the anonymous anti-forgery token Amazon embeds in the claims page. */
export function extractCsrfToken(html: string): string | null {
  const match = /csrf-key'\s*value='([^']+)'/.exec(html) ||
    /name="csrf-key"\s+value="([^"]+)"/.exec(html);
  return match ? match[1] : null;
}

/** Collect Set-Cookie name=value pairs into a single request Cookie header. */
export function cookieHeaderFrom(setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const raw of setCookies) {
    const first = String(raw).split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Only real games. The carousel also promotes Luna streaming spots and
 * in-game loot, which are not free-to-keep PC titles and must not be listed
 * as such: `isFGWP` is Amazon's own "Free Game With Prime" flag, and
 * `category: EXTERNAL` marks a cross-promo tile (e.g. Star Wars Outlaws).
 */
function isClaimableGame(item: LunaItem): boolean {
  if (!item.isFGWP) return false;
  const category = String(item.category || "").toUpperCase();
  return category !== "EXTERNAL" && category !== "LOOT";
}

export class PrimeGamingProviderAdapter implements StoreProviderAdapter {
  readonly store = "prime_gaming" as const;

  async fetchCurrentOffers(): Promise<DiscoveredOffer[]> {
    let csrf: string;
    let cookie: string;
    try {
      const pageRes = await fetch(CLAIMS_PAGE, {
        headers: { "user-agent": BROWSER_UA, accept: "text/html" },
        redirect: "follow",
        next: { revalidate: 0 },
      });
      if (!pageRes.ok) {
        console.error(`[prime-adapter] Claims page returned HTTP ${pageRes.status}`);
        return [];
      }
      const html = await pageRes.text();
      const token = extractCsrfToken(html);
      if (!token) {
        // Amazon reshaped the page. Bail quietly rather than guess.
        console.error("[prime-adapter] No csrf-key in claims page markup");
        return [];
      }
      csrf = token;
      cookie = cookieHeaderFrom(pageRes.headers.getSetCookie?.() ?? []);
    } catch (err) {
      console.error("[prime-adapter] Failed to open claims page:", err);
      return [];
    }

    const collected: LunaItem[] = [];
    for (const collection of COLLECTIONS) {
      try {
        const res = await fetch(`${GRAPHQL_URL}?nonce=${crypto.randomUUID()}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": BROWSER_UA,
            // This exact header name is required; x-csrf-token is rejected.
            "csrf-token": csrf,
            origin: "https://luna.amazon.com",
            referer: CLAIMS_PAGE,
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify({
            operationName: "FeaturedContent",
            variables: { pageSize: 200 },
            query: contentQuery(collection),
          }),
          next: { revalidate: 0 },
        });
        if (!res.ok) {
          console.error(`[prime-adapter] ${collection}: HTTP ${res.status}`);
          continue;
        }
        const payload = (await res.json()) as LunaResponse;
        if (payload.errors?.length) {
          // A renamed collection fails validation here; the other still works.
          console.error(
            `[prime-adapter] ${collection}: ${payload.errors.map((e) => e.message).join("; ")}`
          );
          continue;
        }
        collected.push(...(payload.data?.items?.items ?? []));
      } catch (err) {
        console.error(`[prime-adapter] ${collection}: request failed:`, err);
      }
    }

    const offers: DiscoveredOffer[] = [];
    const seen = new Set<string>();
    for (const item of collected) {
      if (!isClaimableGame(item)) continue;
      // The carousel repeats items from the main list.
      const dedupeKey = String(item.id || item.assets?.id || "");
      if (dedupeKey && seen.has(dedupeKey)) continue;
      if (dedupeKey) seen.add(dedupeKey);
      const assets = item.assets ?? {};
      const title = (assets.title || item.game?.assets?.title || "").trim();
      if (!title) continue;

      const claimUrl = assets.externalClaimLink || CLAIMS_PAGE;

      offers.push({
        externalId: String(item.id || assets.id || `prime-${title.toLowerCase()}`),
        title,
        store: "prime_gaming",
        offerType: "free_with_subscription",
        // Luna exposes neither a start nor an end date on these tiles. Prime
        // offers rotate monthly, but guessing a window would show players a
        // countdown we cannot stand behind.
        startDate: null,
        endDate: null,
        claimUrl,
        storeUrl: claimUrl,
        coverImage: assets.cardMedia?.defaultMedia?.src2x || null,
        description: assets.shortformDescription || null,
        developer: null,
        publisher: null,
        platforms: ["Windows"],
        retailPrice: null,
        retailPriceValue: null,
        currency: null,
        isBaseGame: true,
        videos: [],
        // The claim link names the storefront the key lands on.
        redemptionPlatform: detectRedemption(claimUrl),
        metadata: {
          lunaItemId: item.id ?? null,
          lunaGameId: item.game?.id ?? null,
          category: item.category ?? null,
          requiresPrime: true,
        },
      });
    }

    return offers;
  }
}

/**
 * Which storefront an external claim link redeems on.
 *
 * Amazon encodes this in the product slug rather than the host: every claim
 * link lives on gaming.amazon.com, but the slug carries the destination —
 * `/rims-racing-epic/`, `/doom-eternal-microsoft/`. Matching the host first
 * would label every offer "amazon_games" and lose the real storefront, so the
 * slug is checked before falling back to the host.
 */
function detectRedemption(claimUrl: string): string | null {
  const url = claimUrl.toLowerCase();
  const slugHints: [RegExp, string][] = [
    [/-epic(\/|$|\?)/, "epic"],
    [/-gog(\/|$|\?)/, "gog"],
    [/-(microsoft|xbox)(\/|$|\?)/, "xbox"],
    [/-(ubisoft|uplay)(\/|$|\?)/, "ubisoft"],
    [/-(ea|origin)(\/|$|\?)/, "ea"],
    [/-(legacygames|legacy)(\/|$|\?)/, "legacy_games"],
    [/-(steam)(\/|$|\?)/, "steam"],
    // "aga" = Amazon Games App, Amazon's own launcher.
    [/-aga(\/|$|\?)/, "amazon_games"],
  ];
  const path = url.split("?")[0];
  for (const [re, platform] of slugHints) {
    if (re.test(path)) return platform;
  }
  // Direct links to the storefront itself.
  if (url.includes("epicgames.com")) return "epic";
  if (url.includes("gog.com")) return "gog";
  if (url.includes("ubisoft") || url.includes("uplay")) return "ubisoft";
  if (url.includes("microsoft.com") || url.includes("xbox.com")) return "xbox";
  // No hint: Amazon Games delivers it through its own launcher.
  if (url.includes("luna.amazon") || url.includes("gaming.amazon")) return "amazon_games";
  return null;
}

/**
 * Helper for manually constructing a Prime Gaming offer.
 *
 * Still used by admin APIs and the newsletter integration, and as the fallback
 * for anything the automated pull above does not cover.
 */
export function buildPrimeGamingOffer(opts: {
  title: string;
  claimUrl: string;
  storeUrl?: string;
  coverImage?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  developer?: string;
  publisher?: string;
  platforms?: string[];
  /** Platform the key redeems on: "epic", "gog", "amazon_games", etc. */
  redemptionPlatform?: string;
}): DiscoveredOffer {
  // Use a slugified title as the external ID for manual entries.
  const externalId = `prime-${opts.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

  return {
    externalId,
    title: opts.title,
    store: "prime_gaming",
    offerType: "free_with_subscription",
    startDate: opts.startDate ?? null,
    endDate: opts.endDate ?? null,
    claimUrl: opts.claimUrl,
    storeUrl: opts.storeUrl ?? opts.claimUrl,
    coverImage: opts.coverImage ?? null,
    description: opts.description ?? null,
    developer: opts.developer ?? null,
    publisher: opts.publisher ?? null,
    platforms: opts.platforms ?? ["Windows"],
    retailPrice: null,
    retailPriceValue: null,
    currency: null,
    isBaseGame: true,
    videos: [],
    redemptionPlatform: opts.redemptionPlatform ?? null,
    metadata: { manualEntry: true },
  };
}
