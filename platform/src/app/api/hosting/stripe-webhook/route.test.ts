import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ type: "checkout.session.completed", processed: [] as string[], reclaimed: 0, callbacks: [] as Array<() => Promise<void>>, fail: false }));
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: (callback: () => Promise<void>) => { state.callbacks.push(callback); },
}));
vi.mock("@/lib/dedicatedHosting/stripeWebhook", () => ({ verifyStripeWebhook: () => ({ id: "evt_test_1", type: state.type, data: { object: { id: "cs_test_1" } } }) }));
vi.mock("@/lib/dedicatedHosting/billingEvents", () => ({ processDedicatedStripeEvent: async (event: { type: string }) => { if (state.fail) throw new Error("processing failed"); state.processed.push(event.type); } }));
vi.mock("@/lib/communityHosting/reconcile", () => ({ reconcileCommunityHosting: async () => { state.reclaimed++; } }));

import { POST } from "./route";
const req = () => new Request("https://playbound.club/api/hosting/stripe-webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "signed" } });

beforeEach(() => {
  state.type = "checkout.session.completed";
  state.processed.length = 0;
  state.reclaimed = 0;
  state.callbacks.length = 0;
  state.fail = false;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
});

describe("Dedicated Stripe webhook gate", () => {
  it("acknowledges a paid event only after processing succeeds", async () => {
    expect((await POST(req())).status).toBe(200);
    expect(state.processed).toEqual(["checkout.session.completed"]);
    expect(state.callbacks).toHaveLength(1);
    await state.callbacks[0]();
    expect(state.reclaimed).toBe(1);
  });
  it("asks Stripe to retry a failed billing event", async () => {
    state.fail = true;
    expect((await POST(req())).status).toBe(503);
    expect(state.callbacks).toHaveLength(0);
  });
  it("fails closed if the signing configuration is missing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(req())).status).toBe(503);
  });
});
