import { describe, expect, it } from "vitest";
import {
  isDiscounted,
  percentOff,
  formatCents,
  DEEP_DISCOUNT_MIN_PERCENT,
} from "@/lib/deals";
import type { Game } from "@/lib/data/types";

/**
 * /deals must never invent a discount.
 *
 * A deals page that lists a game at "0% off", or at a negative discount because
 * a curated regular price went stale, is worse than a deals page with an empty
 * section — it costs the reader trust in every other number on the page. These
 * tests pin each way that can happen.
 */

const access = (over: Partial<NonNullable<Game["access"]>> = {}) =>
  ({
    priceType: "PAID",
    regularPriceCents: 999,
    currentPriceCents: 599,
    qualifyingPriceCents: 999,
    currency: "USD",
    purchaseRequired: true,
    ...over,
  }) as NonNullable<Game["access"]>;

describe("isDiscounted", () => {
  it("accepts a genuine discount", () => {
    expect(isDiscounted(access())).toBe(true);
  });

  it("rejects a game at its normal price", () => {
    expect(isDiscounted(access({ currentPriceCents: 999 }))).toBe(false);
  });

  it("rejects a stale regular price that is below the current one", () => {
    // Would otherwise render as "-67% off".
    expect(isDiscounted(access({ regularPriceCents: 599, currentPriceCents: 999 }))).toBe(false);
  });

  it("treats a missing price as unknown, not as free", () => {
    expect(isDiscounted(access({ currentPriceCents: null }))).toBe(false);
    expect(isDiscounted(access({ regularPriceCents: null }))).toBe(false);
  });

  it("rejects a zero or negative regular price", () => {
    // No meaningful percentage exists, and it usually means the block is unset.
    expect(isDiscounted(access({ regularPriceCents: 0, currentPriceCents: 0 }))).toBe(false);
    expect(isDiscounted(access({ regularPriceCents: -100 }))).toBe(false);
  });

  it("ignores games that are not PAID", () => {
    // A FREE game has no discount to advertise even if prices linger on the doc,
    // and PAID_BASE_GAME_REQUIRED prices the base game, not this one.
    expect(isDiscounted(access({ priceType: "FREE" }))).toBe(false);
    expect(isDiscounted(access({ priceType: "PAID_BASE_GAME_REQUIRED" }))).toBe(false);
  });

  it("handles a missing access block", () => {
    expect(isDiscounted(undefined)).toBe(false);
  });
});

describe("percentOff", () => {
  it("floors rather than rounds, so a discount is never overstated", () => {
    // 999 → 599 is 40.04%. Claiming 41% would be a lie in our favour.
    expect(percentOff(999, 599)).toBe(40);
    expect(percentOff(1499, 599)).toBe(60);
    expect(percentOff(1000, 500)).toBe(50);
  });

  it("returns 0 for an unusable regular price", () => {
    expect(percentOff(0, 0)).toBe(0);
    expect(percentOff(-5, 1)).toBe(0);
  });

  it("returns 0 when there is no reduction", () => {
    expect(percentOff(599, 599)).toBe(0);
  });
});

describe("the deep-discount bar", () => {
  /*
   * `isDiscounted` and the bar are separate filters and must stay that way:
   * one rejects data that cannot describe a reduction, the other rejects real
   * reductions that are not worth listing. These tests pin that separation, so
   * a future change to the bar cannot quietly start admitting bad data.
   */
  it("is a deliberate, demanding number", () => {
    expect(DEEP_DISCOUNT_MIN_PERCENT).toBe(75);
  });

  it("still treats a shallow discount as a real discount", () => {
    // 10% off is genuine — it just does not belong on the page.
    expect(isDiscounted(access({ regularPriceCents: 1000, currentPriceCents: 900 }))).toBe(true);
    expect(percentOff(1000, 900)).toBeLessThan(DEEP_DISCOUNT_MIN_PERCENT);
  });

  it("admits the prices the paid catalog actually reaches on deep sales", () => {
    // The catalog sits at $5.99–$14.99, so these are the real boundary cases.
    expect(percentOff(599, 149)).toBeGreaterThanOrEqual(DEEP_DISCOUNT_MIN_PERCENT); // 75%
    expect(percentOff(999, 249)).toBeGreaterThanOrEqual(DEEP_DISCOUNT_MIN_PERCENT); // 75%
    expect(percentOff(1499, 374)).toBeGreaterThanOrEqual(DEEP_DISCOUNT_MIN_PERCENT); // 75%
  });

  it("excludes a discount one cent short of the bar", () => {
    // 599 → 150 is 74%, and flooring keeps it there rather than rounding it in.
    expect(percentOff(599, 150)).toBe(74);
    expect(percentOff(599, 150)).toBeLessThan(DEEP_DISCOUNT_MIN_PERCENT);
  });
});

describe("formatCents", () => {
  it("renders whole and fractional dollars with two places", () => {
    expect(formatCents(599)).toBe("$5.99");
    expect(formatCents(1000)).toBe("$10.00");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("omits the symbol for a currency it does not know", () => {
    expect(formatCents(599, "EUR")).toBe("5.99");
  });
});
