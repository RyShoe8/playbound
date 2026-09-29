import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ type: "checkout.session.completed", processed: [] as string[], fail: false }));
vi.mock("@/lib/dedicatedHosting/stripeWebhook", () => ({ verifyStripeWebhook: () => ({ id: "evt_test_1", type: state.type, data: { object: { id: "cs_test_1" } } }) }));
vi.mock("@/lib/dedicatedHosting/billingEvents", () => ({ processDedicatedStripeEvent: async (event: { type: string }) => { if (state.fail) throw new Error("processing failed"); state.processed.push(event.type); } }));

import { POST } from "./route";
const req = () => new Request("https://playbound.club/api/hosting/stripe-webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "signed" } });

beforeEach(() => {
  state.type = "checkout.session.completed";
  state.processed.length = 0;
  state.fail = false;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
});

describe("Dedicated Stripe webhook gate", () => {
  it("acknowledges a paid event only after processing succeeds", async () => {
    expect((await POST(req())).status).toBe(200);
    expect(state.processed).toEqual(["checkout.session.completed"]);
  });
  it("asks Stripe to retry a failed billing event", async () => {
    state.fail = true;
    expect((await POST(req())).status).toBe(503);
  });
  it("fails closed if the signing configuration is missing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(req())).status).toBe(503);
  });
});
