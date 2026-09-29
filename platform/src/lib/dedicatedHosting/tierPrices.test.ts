import { describe, expect, it } from "vitest";
import { preservedPackagePrices, type HostingTier } from "./tier";

const old = { packages: [{ slots: 4, priceCents: 799, currency: "usd", enabled: true, order: 0, stripePriceId: "price_good" }] } as HostingTier;

describe("package Stripe ID integrity", () => {
  it("preserves a saved price only for unchanged commercial terms", () => {
    expect(preservedPackagePrices(old, [{ ...old.packages[0], stripePriceId: "price_forged" }])[0].stripePriceId).toBe("price_good");
    expect(preservedPackagePrices(old, [{ ...old.packages[0], priceCents: 899 }])[0].stripePriceId).toBeNull();
    expect(preservedPackagePrices(old, [{ ...old.packages[0], slots: 8 }])[0].stripePriceId).toBeNull();
    expect(preservedPackagePrices(old, [{ ...old.packages[0], currency: "eur" }])[0].stripePriceId).toBeNull();
  });
});
