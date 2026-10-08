import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hold: { _id: "507f1f77bcf86cd799439011", checkoutSessionId: null as string | null },
  attempted: { requestedSessionExpiresAt: new Date("2030-01-01T00:35:00Z") },
  calls: [] as string[],
  salesEnabled: true,
  failAttach: false,
  failExpire: false,
}));
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/models/DedicatedSubscription", () => ({ default: { exists: async () => false } }));
vi.mock("@/lib/dedicatedHosting/tier", () => ({ getTier: async () => ({
  key: "basic", salesEnabled: state.salesEnabled, stripeProductId: "prod_basic",
  regions: [{ key: "us-central", salesEnabled: true }],
  packages: [{ slots: 8, enabled: true, stripePriceId: "price_valid", priceCents: 1299, currency: "usd" }],
  games: [{ profileKey: "openra:base", enabled: true, newServerCreationEnabled: true }],
}) }));
vi.mock("@/lib/dedicatedHosting/capacity", () => ({
  createCapacityHold: async () => { state.calls.push("hold"); return state.hold; },
  markCheckoutAttempt: async () => { state.calls.push("attempt"); return state.attempted; },
  attachCheckoutSessionToHold: async () => { state.calls.push("attach"); if (state.failAttach) throw new Error("attach failed"); },
  releaseCapacityHold: async () => { state.calls.push("release"); },
}));

import { prepareBasicCheckout } from "./checkout";
const input = { userId: "507f191e810c19729de860ea", regionKey: "us-central", slots: 8, checkoutKey: "stable-key", returnOrigin: "https://preview.playbound.club" };

beforeEach(() => {
  state.calls.length = 0;
  state.salesEnabled = true;
  state.failAttach = false;
  state.failExpire = false;
  state.hold.checkoutSessionId = null;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/expire")) {
      state.calls.push("expire");
      return new Response(JSON.stringify(state.failExpire ? { error: { message: "unavailable" } } : { id: "cs_test_1" }), { status: state.failExpire ? 503 : 200 });
    }
    state.calls.push("stripe");
    const fields = new URLSearchParams(init.body as string);
    expect(fields.get("line_items[0][price]")).toBe("price_valid");
    expect(fields.get("success_url")).toBe("https://preview.playbound.club/hosting?checkout=returned");
    expect(fields.get("expires_at")).toBe(String(state.attempted.requestedSessionExpiresAt.getTime() / 1000));
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("playbound-checkout-stable-key");
    return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/1", expires_at: state.attempted.requestedSessionExpiresAt.getTime() / 1000 }), { status: 200 });
  }));
});

describe("Dedicated Basic Checkout preparation", () => {
  it("cannot call Stripe while sales remain closed", async () => {
    state.salesEnabled = false;
    await expect(prepareBasicCheckout(input)).rejects.toThrow("not open");
    expect(state.calls).toEqual([]);
  });
  it("reserves capacity before creating a session and attaches it before returning a URL", async () => {
    expect(await prepareBasicCheckout(input)).toEqual({ url: "https://checkout.stripe.com/c/pay/1", sessionId: "cs_test_1" });
    expect(state.calls).toEqual(["hold", "attempt", "stripe", "attach"]);
  });
  it("expires the payable Session before releasing capacity when attach fails", async () => {
    state.failAttach = true;
    await expect(prepareBasicCheckout(input)).rejects.toThrow("attach failed");
    expect(state.calls).toEqual(["hold", "attempt", "stripe", "attach", "expire", "release"]);
  });
  it("keeps capacity if Stripe cannot confirm Session expiry", async () => {
    state.failAttach = true;
    state.failExpire = true;
    await expect(prepareBasicCheckout(input)).rejects.toThrow("attach failed");
    expect(state.calls).not.toContain("release");
  });
  it("keeps capacity if the create response is lost", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network response lost"); }));
    await expect(prepareBasicCheckout(input)).rejects.toThrow("network response lost");
    expect(state.calls).toEqual(["hold", "attempt"]);
  });
});
