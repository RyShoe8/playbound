import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ type: "checkout.session.completed", released: [] as string[] }));
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/dedicatedHosting/stripeWebhook", () => ({ verifyStripeWebhook: () => ({ type: state.type, data: { object: { id: "cs_test_1" } } }) }));
vi.mock("@/lib/models/DedicatedCapacityHold", () => ({ default: { findOne: () => ({ select: () => ({ lean: async () => ({ _id: "507f1f77bcf86cd799439011" }) }) }) } }));
vi.mock("@/lib/dedicatedHosting/capacity", () => ({ releaseCapacityHold: async (id: string) => { state.released.push(id); } }));

import { POST } from "./route";
const req = () => new Request("https://playbound.club/api/hosting/stripe-webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "signed" } });

beforeEach(() => {
  state.type = "checkout.session.completed";
  state.released.length = 0;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
});

describe("Dedicated Stripe webhook gate", () => {
  it("never acknowledges a paid event before billing reconciliation exists", async () => {
    expect((await POST(req())).status).toBe(503);
    expect(state.released).toEqual([]);
  });
  it("releases a matching expired checkout hold", async () => {
    state.type = "checkout.session.expired";
    expect((await POST(req())).status).toBe(200);
    expect(state.released).toEqual(["507f1f77bcf86cd799439011"]);
  });
  it("fails closed if the signing configuration is missing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(req())).status).toBe(503);
  });
});
