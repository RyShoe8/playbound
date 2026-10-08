import { describe, expect, it } from "vitest";
import { basicSalesBlockers, stripeMode } from "./salesReadiness";
import type { HostingTier } from "./tier";

const tier = {
  key: "basic", stripeProductId: "prod_basic",
  regions: [{ key: "us-central", salesEnabled: true }],
  packages: [{ slots: 8, enabled: true, priceCents: 1299, stripePriceId: "price_basic_8" }],
  games: [{ profileKey: "openra:base", enabled: true, newServerCreationEnabled: true }],
} as HostingTier;
const testEnv = { secretKey: "sk_test_example", webhookSecret: "whsec_example", vercelEnv: "preview" };

describe("hosting sales readiness", () => {
  it("permits a complete Basic test configuration on Preview", () => {
    expect(stripeMode(testEnv.secretKey)).toBe("test");
    expect(basicSalesBlockers(tier, testEnv)).toEqual([]);
  });
  it("keeps checkout closed without a webhook or synced package", () => {
    expect(basicSalesBlockers({ ...tier, packages: [{ ...tier.packages[0], stripePriceId: null }] },
      { ...testEnv, webhookSecret: undefined })).toEqual([
      "Configure the Stripe webhook signing secret", "Sync every enabled slot package to Stripe",
    ]);
  });
  it("never opens live-key checkout in Preview or test-key checkout in Production", () => {
    expect(basicSalesBlockers(tier, { ...testEnv, secretKey: "sk_live_example" })).toContain("Preview checkout requires a Stripe test key");
    expect(basicSalesBlockers(tier, { ...testEnv, vercelEnv: "production" })).toContain("Production requires a live Stripe key; use a Preview deployment for test payments");
    expect(basicSalesBlockers(tier, { ...testEnv, secretKey: "sk_live_example", vercelEnv: "production" })).toEqual([]);
  });
  it("does not mistake a priced Pro plan for a complete checkout flow", () => {
    expect(basicSalesBlockers({ ...tier, key: "pro" }, testEnv)).toContain("Paid checkout is currently available only for Basic");
  });
});
