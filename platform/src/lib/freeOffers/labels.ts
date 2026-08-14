/**
 * Human-readable labels for offer types, store names, and expiration.
 *
 * Pure functions — no DB access, safe to call from client or server.
 */

import type { OfferType, StoreSlug } from "./types";

// ── Store display names ──────────────────────────────────────────────────

const STORE_NAMES: Record<StoreSlug, string> = {
  epic: "Epic Games Store",
  steam: "Steam",
  gog: "GOG",
  prime_gaming: "Amazon Prime Gaming",
};

export function storeDisplayName(store: StoreSlug): string {
  return STORE_NAMES[store] ?? store;
}

/** Short name for compact badges. */
export function storeShortName(store: StoreSlug): string {
  const short: Record<StoreSlug, string> = {
    epic: "Epic",
    steam: "Steam",
    gog: "GOG",
    prime_gaming: "Prime Gaming",
  };
  return short[store] ?? store;
}

// ── Offer type labels ────────────────────────────────────────────────────

/**
 * Label for the offer type, optionally flavored by store.
 *
 * Examples:
 *   "FREE TO KEEP"
 *   "FREE THIS WEEKEND"
 *   "FREE WITH PRIME"
 */
export function offerTypeLabel(type: OfferType, store?: StoreSlug): string {
  switch (type) {
    case "free_to_keep":
      return "FREE TO KEEP";
    case "free_weekend":
      return "FREE THIS WEEKEND";
    case "free_trial":
      return "FREE TRIAL";
    case "free_with_subscription":
      if (store === "prime_gaming") return "FREE WITH PRIME";
      return "FREE WITH SUBSCRIPTION";
    default:
      return "FREE";
  }
}

/** CTA label for the claim button. */
export function claimCtaLabel(store: StoreSlug): string {
  const ctas: Record<StoreSlug, string> = {
    epic: "Claim on Epic",
    steam: "Get on Steam",
    gog: "Claim on GOG",
    prime_gaming: "Claim with Prime",
  };
  return ctas[store] ?? `Claim on ${storeShortName(store)}`;
}

// ── Expiration labels ────────────────────────────────────────────────────

/**
 * Human-friendly expiration message.
 *
 * Avoids unnecessary precision:
 *   "Ends today"
 *   "Ends tomorrow"
 *   "Ends Thursday"
 *   "2 days left"
 *   "14 hours left"
 *
 * Returns null if endDate is in the past or missing.
 */
export function expirationLabel(endDate: Date | string | null): string | null {
  if (!endDate) return null;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) return null; // Already expired.

  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < 1) {
    const mins = Math.ceil(diffMs / (1000 * 60));
    return `${mins} minute${mins === 1 ? "" : "s"} left`;
  }

  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return hours <= 1 ? "Ends today" : `${hours} hours left`;
  }

  if (diffDays < 2) return "Ends tomorrow";

  if (diffDays < 7) {
    const dayName = end.toLocaleDateString("en-US", { weekday: "long" });
    return `Ends ${dayName}`;
  }

  const days = Math.floor(diffDays);
  return `${days} days left`;
}

/**
 * Date range label for historical offers.
 * "August 13–20, 2026"
 */
export function dateRangeLabel(
  start: Date | string | null,
  end: Date | string | null
): string {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (s && e) {
    const sameMonth =
      s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameMonth) {
      return `${s.toLocaleDateString("en-US", { month: "long" })} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${fmt.format(s)} – ${fmt.format(e)}`;
  }

  if (s) return fmt.format(s);
  if (e) return `Until ${fmt.format(e)}`;
  return "Dates unknown";
}

// ── Store colors (for badges/accents) ────────────────────────────────────

/** oklch accent color per store. */
export function storeColor(store: StoreSlug): string {
  const colors: Record<StoreSlug, string> = {
    epic: "oklch(0.70 0.14 220)",   // Epic blue
    steam: "oklch(0.68 0.14 250)",  // Steam blue-purple
    gog: "oklch(0.72 0.18 310)",    // GOG purple
    prime_gaming: "oklch(0.72 0.18 170)", // Prime teal
  };
  return colors[store] ?? "oklch(0.68 0.15 280)";
}
