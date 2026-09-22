/**
 * Alienware Arena free-key ingestion adapter.
 *
 * Alienware Arena runs a rolling series of key giveaways — mostly Steam keys
 * for indie titles, DLC packs and MMO starter bundles. Unlike Prime Gaming it
 * exposes its giveaway board through an unauthenticated JSON endpoint (the
 * "featured tile" ESI fragment the site's own front page renders from), so
 * this adapter can ingest automatically.
 *
 * Shape of the response: one featured giveaway at the top level, plus the rest
 * of the current board in `data`. Both are folded into one list here and
 * de-duplicated by id, because the featured item also tends to be stale — it
 * stays pinned long after newer giveaways appear.
 *
 * Caveats baked into the mapping below:
 *   - No end date is published. Giveaways run until the key pool is empty, so
 *     endDate is null and the UI falls back to "while keys last".
 *   - Claiming requires a (free) Alienware Arena account and usually some ARP
 *     points, so these are `free_to_keep` but never zero-friction.
 *   - A large share of the board is DLC / bundle keys rather than base games.
 *     isBaseGame is inferred from the title so the UI can rank real games up.
 */

import type { StoreProviderAdapter, DiscoveredOffer } from "./types";

/**
 * Public ESI fragment backing the giveaway board on na.alienwarearena.com.
 * Returns JSON, no auth, no cookie.
 */
const AWA_GIVEAWAY_URL = "https://na.alienwarearena.com/esi/featured-tile-data/Giveaway";

const AWA_ORIGIN = "https://na.alienwarearena.com";

type AwaGiveaway = {
  id?: number;
  title?: string;
  image?: string;
  url?: string;
  contentType?: string;
  publishedAt?: string;
  featured?: boolean;
  instructions?: string;
  description?: string;
  isCommunityGiveaway?: boolean;
};

type AwaResponse = AwaGiveaway & { data?: AwaGiveaway[] };

/**
 * Strip the boilerplate Alienware Arena appends to every listing so the title
 * has a chance of matching a catalog game.
 *
 * "Frog Sqwad Steam Game Key Giveaway" -> "Frog Sqwad"
 * "RIDE 6 Welcome Bikes Pack Key Giveaway" -> "RIDE 6 Welcome Bikes Pack"
 */
export function cleanAwaTitle(raw: string): string {
  return String(raw || "")
    .replace(/\s*\bkey\s+giveaway\b\s*$/i, "")
    .replace(/\s*\bgiveaway\b\s*$/i, "")
    .replace(/\s*\b(steam|epic|gog|origin|uplay|ubisoft)\s+game\b\s*$/i, "")
    .replace(/\s*\b(steam|epic|gog|origin|uplay|ubisoft)\s+key\b\s*$/i, "")
    .replace(/\s*\bkey\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Which storefront the key redeems on, read from the title and the redemption
 * instructions block. Defaults to Steam, which is the overwhelming majority.
 */
export function detectRedemptionPlatform(giveaway: AwaGiveaway): string {
  const haystack = `${giveaway.title ?? ""} ${giveaway.instructions ?? ""}`.toLowerCase();
  if (/\bepic games?\b|\bepicgames\.com\b/.test(haystack)) return "epic";
  if (/\bgog\.com\b|\bgog galaxy\b/.test(haystack)) return "gog";
  if (/\bubisoft\b|\buplay\b/.test(haystack)) return "ubisoft";
  if (/\borigin\b|\bea app\b/.test(haystack)) return "ea";
  if (/\bmicrosoft store\b|\bxbox\b/.test(haystack)) return "xbox";
  return "steam";
}

/**
 * Whether the giveaway is a full game rather than DLC, currency or a cosmetic
 * pack. Conservative: anything that names itself a pack/bundle/DLC is not a
 * base game, so the free-games grid does not headline a skin bundle.
 */
export function looksLikeBaseGame(title: string): boolean {
  return !/\b(dlc|pack|bundle|starter|skin|currency|coins?|booster|expansion|season pass|beta|closed test|reward)\b/i.test(
    title
  );
}

/** Turn the site's relative board path into an absolute URL. */
function absoluteUrl(url: string | undefined): string {
  const path = String(url || "").trim();
  if (!path) return AWA_ORIGIN;
  if (/^https?:\/\//i.test(path)) return path;
  return `${AWA_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Collapse the HTML description into a short plain-text blurb. */
function plainText(html: string | undefined, max = 400): string | null {
  const text = String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function parsePublishedAt(value: string | undefined): Date | null {
  if (!value) return null;
  // "2026-09-16 10:38:05" — space-separated, treated as UTC.
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class AlienwareArenaProviderAdapter implements StoreProviderAdapter {
  readonly store = "alienware_arena" as const;

  async fetchCurrentOffers(): Promise<DiscoveredOffer[]> {
    let payload: AwaResponse;
    try {
      const res = await fetch(AWA_GIVEAWAY_URL, {
        headers: {
          "user-agent": "PlayBoundIngestion/1.0",
          accept: "application/json",
        },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        console.error(`[alienware-adapter] Giveaway endpoint returned HTTP ${res.status}`);
        return [];
      }
      payload = (await res.json()) as AwaResponse;
    } catch (err) {
      console.error("[alienware-adapter] Failed to fetch giveaway board:", err);
      return [];
    }

    // The featured item is duplicated inside `data` often enough that ids, not
    // titles, decide what is new.
    const seen = new Set<string>();
    const raw: AwaGiveaway[] = [];
    for (const item of [payload, ...(payload.data ?? [])]) {
      if (!item?.id || !item.title) continue;
      const id = String(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      raw.push(item);
    }

    const offers: DiscoveredOffer[] = [];
    for (const item of raw) {
      // The board occasionally carries non-giveaway tiles (articles, polls).
      if (item.contentType && item.contentType.toLowerCase() !== "giveaway") continue;

      const title = cleanAwaTitle(item.title!);
      if (!title) continue;

      const storeUrl = absoluteUrl(item.url);

      offers.push({
        externalId: String(item.id),
        title,
        store: "alienware_arena",
        offerType: "free_to_keep",
        startDate: parsePublishedAt(item.publishedAt),
        // Alienware Arena never publishes an end date — a giveaway closes when
        // the key pool runs dry, which can be hours or months.
        endDate: null,
        claimUrl: storeUrl,
        storeUrl,
        coverImage: item.image || null,
        description: plainText(item.description),
        developer: null,
        publisher: null,
        platforms: ["Windows"],
        retailPrice: null,
        retailPriceValue: null,
        currency: null,
        isBaseGame: looksLikeBaseGame(item.title!),
        videos: [],
        redemptionPlatform: detectRedemptionPlatform(item),
        metadata: {
          alienwareId: item.id,
          featured: Boolean(item.featured),
          communityGiveaway: Boolean(item.isCommunityGiveaway),
          originalTitle: item.title,
          // Claiming needs an account and usually ARP points; surfaced so the
          // UI can warn rather than promise a one-click claim.
          requiresAccount: true,
        },
      });
    }

    return offers;
  }
}
