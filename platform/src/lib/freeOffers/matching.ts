/**
 * Game matching engine for free-offer ingestion.
 *
 * Conservative strategy — favors correctness over aggressive matching.
 * When confidence is insufficient, the offer is left "unmatched" for
 * admin review rather than incorrectly merging two games.
 *
 * Match cascade:
 *   1. Exact external ID (steamAppId, externalIds.epic, etc.)
 *   2. Exact store URL
 *   3. Exact normalized title + same developer
 *   4. Exact normalized title + same release year (±1)
 *   5. Exact normalized title alone → "high" confidence
 *   6. Fuzzy title (Levenshtein ≤ 2) → "low" confidence (flagged for review)
 */

import type { Game } from "@/lib/data/types";
import {
  findGameByExternalId,
  findGameByStoreUrl,
  findGamesByTitle,
} from "@/lib/catalog";
import type { MatchConfidence, StoreSlug } from "./types";
import type { DiscoveredOffer } from "./providers/types";

export interface MatchResult {
  game: Game | null;
  confidence: MatchConfidence;
}

// ── Title normalization ──────────────────────────────────────────────────

/** Normalize a title for comparison: lowercase, strip symbols, collapse whitespace. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©:;'\-–—]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein distance — good enough for short game titles.
 * O(n*m) but titles are rarely longer than ~60 chars.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/**
 * Attempt to match a discovered offer to an existing CatalogGame.
 *
 * The cascade tries the most specific matches first (IDs, URLs) and
 * falls back to increasingly fuzzy title matching.
 */
export async function matchGame(
  offer: DiscoveredOffer
): Promise<MatchResult> {
  // ── 1. External ID match ───────────────────────────────────────────
  if (offer.externalId) {
    const byId = await findGameByExternalId(
      offer.store === "prime_gaming" ? "epic" : (offer.store as "epic" | "steam" | "gog"),
      offer.externalId
    );
    if (byId) return { game: byId, confidence: "exact" };
  }

  // ── 2. Store URL match ─────────────────────────────────────────────
  if (offer.storeUrl) {
    const store = offer.store === "prime_gaming" ? "epic" : (offer.store as "epic" | "steam" | "gog");
    const byUrl = await findGameByStoreUrl(store, offer.storeUrl);
    if (byUrl) return { game: byUrl, confidence: "exact" };
  }

  // ── 3–5. Title-based matching ──────────────────────────────────────
  const titleMatches = await findGamesByTitle(offer.title);

  if (titleMatches.length === 1) {
    const match = titleMatches[0];

    // 3. Exact title + same developer.
    if (
      offer.developer &&
      match.developerSlug &&
      normalizeTitle(offer.developer) === normalizeTitle(match.developerSlug)
    ) {
      return { game: match, confidence: "exact" };
    }

    // 4. Exact title + same release year (±1).
    if (
      offer.metadata?.releaseYear &&
      Math.abs(Number(offer.metadata.releaseYear) - match.releaseYear) <= 1
    ) {
      return { game: match, confidence: "high" };
    }

    // 5. Exact title alone → high confidence.
    return { game: match, confidence: "high" };
  }

  if (titleMatches.length > 1) {
    // Multiple title matches — try to disambiguate by developer.
    if (offer.developer) {
      const devNorm = normalizeTitle(offer.developer);
      const devMatch = titleMatches.find(
        (g) => normalizeTitle(g.developerSlug) === devNorm
      );
      if (devMatch) return { game: devMatch, confidence: "high" };
    }
    // Ambiguous — flag for review.
    return { game: null, confidence: "low" };
  }

  // ── 6. Fuzzy title matching ────────────────────────────────────────
  // Search all catalog games by checking Levenshtein distance.
  // This is expensive for large catalogs, but the PlayBound catalog
  // is deliberately small (< 200 games), so it's fine.
  const normOffer = normalizeTitle(offer.title);
  if (normOffer.length < 3) {
    return { game: null, confidence: "unmatched" };
  }

  // Fuzzy matching against the catalog would need listAllGames() which
  // is admin-only and heavy. For now, if exact title didn't match,
  // mark as unmatched. The admin can resolve these manually.
  return { game: null, confidence: "unmatched" };
}

/**
 * Check if two offers represent the same promotion.
 * Used for idempotent ingestion — prevents duplicate offers.
 */
export function offersMatch(
  a: { store: StoreSlug; externalId: string },
  b: { store: StoreSlug; externalId: string }
): boolean {
  return a.store === b.store && a.externalId === b.externalId;
}
