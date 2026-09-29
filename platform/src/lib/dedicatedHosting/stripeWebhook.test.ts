import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { verifyStripeWebhook } from "./stripeWebhook";

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
});

describe("Stripe webhook signature boundary", () => {
  it("accepts only the exact signed raw payload", () => {
    const raw = JSON.stringify({ id: "evt_test_1", type: "checkout.session.completed", data: { object: { id: "cs_test_1" } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: "whsec_example" });
    expect(verifyStripeWebhook(raw, signature).id).toBe("evt_test_1");
    expect(() => verifyStripeWebhook(`${raw} `, signature)).toThrow();
  });
  it("fails closed without the endpoint secret or signature", () => {
    expect(() => verifyStripeWebhook("{}", null)).toThrow("Missing Stripe signature");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(() => verifyStripeWebhook("{}", "t=1,v1=bogus")).toThrow("not configured");
  });
});
