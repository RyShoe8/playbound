/**
 * Reading access fields off raw catalog documents.
 *
 * Shared by the full graph (`graph.ts`) and the games-only tier map
 * (`tiers.ts`) so the two cannot drift: a change to how a stored document is
 * interpreted has to land in one place, and both readers see it. Two copies of
 * this logic would be a slow way to make the audit disagree with the site.
 *
 * Pure on purpose — no model imports, so the interpretation can be tested
 * without a database.
 */

import { accessId, type GameAccess } from "./types";
import { offersFromUnknown, withDerivedCurrentPrice } from "./offers";

/** The stored shape. Everything optional; absent means unclassified. */
export interface AccessDoc {
  slug?: unknown;
  title?: unknown;
  access?: unknown;
}

/**
 * Absent access means free — the state every unclassified row is in.
 *
 * This is the load-bearing default of the whole model. The catalog was
 * assembled under free-only rules, so "no access record" is not missing data,
 * it is an accurate statement about a free game. Returning `undefined` here
 * (rather than a paid-ish placeholder) is what lets the model ship without
 * reclassifying hundreds of rows first.
 */
export function accessFromDoc(raw: unknown): GameAccess | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  if (!a.priceType) return undefined;
  return withDerivedCurrentPrice({
    priceType: a.priceType as GameAccess["priceType"],
    regularPriceCents: (a.regularPriceCents as number) ?? null,
    currentPriceCents: (a.currentPriceCents as number) ?? null,
    qualifyingPriceCents: (a.qualifyingPriceCents as number) ?? null,
    currency: "USD",
    purchaseRequired: Boolean(a.purchaseRequired),
    requiresBaseGameAssets: Boolean(a.requiresBaseGameAssets),
    requiresOwnedBaseGame: Boolean(a.requiresOwnedBaseGame),
    requiresGameSlugs: Array.isArray(a.requiresGameSlugs)
      ? a.requiresGameSlugs.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [],
    offers: offersFromUnknown(a.offers),
  });
}

/** Games this game cannot be played without, as namespaced node ids. */
export function gameDependencies(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const slugs = (raw as { requiresGameSlugs?: unknown }).requiresGameSlugs;
  if (!Array.isArray(slugs)) return [];
  return slugs.filter((s): s is string => typeof s === "string" && s.length > 0).map(accessId.game);
}
