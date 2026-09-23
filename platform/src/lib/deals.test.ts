import { describe, expect, it } from "vitest";
import { percentOff, formatCents, DEEP_DISCOUNT_MIN_PERCENT } from "@/lib/dealsShared";

/**
 * Pure formatting/threshold helpers only. `isDiscounted` and `dealStoreKey`
 * are gone — the store-wide scanner they existed for (checking a PlayBound
 * catalog game's `access.*Cents`, and normalising a free-text retailer string
 * onto a StoreSlug) no longer applies now that discounts come from a typed
 * store-discount provider that already carries `store` as a real
 * `DiscountStoreSlug` and validated cents fields. See
 * `storeDiscounts/providers/*.test.ts` for the tests that replaced them —
 * "never invent a discount" is now enforced in the providers, at the source.
 */

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
  it("is a deliberate, demanding number", () => {
    expect(DEEP_DISCOUNT_MIN_PERCENT).toBe(75);
  });

  it("excludes a discount one cent short of the bar", () => {
    // 599 → 150 is 74%, and flooring keeps it there rather than rounding it in.
    expect(percentOff(599, 150)).toBe(74);
    expect(percentOff(599, 150)).toBeLessThan(DEEP_DISCOUNT_MIN_PERCENT);
  });

  it("includes the boundary itself", () => {
    expect(percentOff(599, 149)).toBeGreaterThanOrEqual(DEEP_DISCOUNT_MIN_PERCENT);
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
