import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  schedule: null as null | Record<string, unknown>,
  createCalls: 0,
  updateCalls: [] as Array<Record<string, unknown>>,
  releaseCalls: 0,
}));
vi.mock("stripe", () => ({ default: class {
  subscriptions = { retrieve: async () => ({
    schedule: state.schedule ? "sub_sched_test" : null,
    items: { data: [{ price: { id: "price_8" } }] },
  }) };
  subscriptionSchedules = {
    create: async () => {
      state.createCalls++;
      state.schedule = { id: "sub_sched_test", subscription: "sub_test", status: "active",
        current_phase: { start_date: 1_800_000_000, end_date: 1_802_592_000 },
        phases: [{ start_date: 1_800_000_000, end_date: 1_802_592_000, items: [{ price: "price_8" }] }],
      };
      return state.schedule;
    },
    retrieve: async () => state.schedule,
    update: async (_id: string, params: Record<string, unknown>) => {
      state.updateCalls.push(params);
      state.schedule = { ...state.schedule, phases: params.phases };
      return state.schedule;
    },
    release: async () => { state.releaseCalls++; state.schedule = { ...state.schedule, status: "released", released_subscription: "sub_test", subscription: null }; return state.schedule; },
  };
} }));
import { ensureStripeDowngrade, releaseStripeDowngrade } from "./stripeBillingRemote";

beforeEach(() => {
  state.schedule = null; state.createCalls = 0; state.updateCalls = []; state.releaseCalls = 0;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
});

describe("Stripe period-end downgrade", () => {
  it("creates a two-phase schedule once, preserving the entitlement identity", async () => {
    const input = { subscriptionId: "sub_test", requestKey: "request-1", currentPriceId: "price_8", targetPriceId: "price_4", originalHoldId: "hold_1", currentPeriodEnd: 1_802_592_000 };
    expect(await ensureStripeDowngrade(input)).toMatchObject({ scheduleId: "sub_sched_test" });
    expect(state.createCalls).toBe(1);
    expect(state.updateCalls).toHaveLength(1);
    const phases = state.updateCalls[0].phases as Array<Record<string, unknown>>;
    expect(phases[0].metadata).toEqual({ playbound_hold_id: "hold_1" });
    expect(phases[1]).toMatchObject({ start_date: 1_802_592_000, duration: { interval: "month", interval_count: 1 }, proration_behavior: "none", metadata: { playbound_hold_id: "hold_1" } });
    expect(await ensureStripeDowngrade(input)).toMatchObject({ scheduleId: "sub_sched_test" });
    expect(state.createCalls).toBe(1);
    expect(state.updateCalls).toHaveLength(1);
  });
  it("releases only the matching subscription schedule", async () => {
    const input = { subscriptionId: "sub_test", requestKey: "request-1", currentPriceId: "price_8", targetPriceId: "price_4", originalHoldId: "hold_1", currentPeriodEnd: 1_802_592_000 };
    await ensureStripeDowngrade(input);
    await expect(releaseStripeDowngrade("sub_sched_test", "sub_other")).rejects.toThrow("does not belong");
    await releaseStripeDowngrade("sub_sched_test", "sub_test");
    await releaseStripeDowngrade("sub_sched_test", "sub_test");
    expect(state.releaseCalls).toBe(1);
  });
});
