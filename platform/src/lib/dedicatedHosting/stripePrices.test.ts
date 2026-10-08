import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

vi.mock("@/lib/db", () => ({ default: async () => undefined }));

import DedicatedHostingTier from "@/lib/models/DedicatedHostingTier";
import { getTier, saveTier } from "./tier";
import { syncBasicStripePrices, syncTierStripePrices } from "./stripePrices";

let mongo: MongoMemoryServer;
let nextPrice = 0;
const prices = new Map<string, { id: string; active: boolean; product: string; unit_amount: number; currency: string; recurring: { interval: string } }>();
const calls: Array<{ path: string; method: string }> = [];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "stripe-price-test" });
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await DedicatedHostingTier.deleteMany({});
  nextPrice = 0;
  prices.clear();
  calls.length = 0;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace("/v1/", "");
    calls.push({ path, method: init.method || "GET" });
    let data: unknown;
    if (path === "products" && init.method === "POST") {
      const body = new URLSearchParams(init.body as string);
      data = { id: `prod_${body.get("metadata[playbound_tier]")}`, active: true };
    }
    else if (/^products\/prod_(basic|pro|extreme)$/.test(path)) data = { id: path.split("/")[1], active: true };
    else if (path === "prices" && init.method === "POST") {
      const body = new URLSearchParams(init.body as string);
      const price = {
        id: `price_${++nextPrice}`, active: true, product: body.get("product")!,
        unit_amount: Number(body.get("unit_amount")), currency: body.get("currency")!, recurring: { interval: body.get("recurring[interval]")! },
      };
      prices.set(price.id, price);
      data = price;
    } else if (path.startsWith("prices/")) data = prices.get(path.split("/")[1]);
    return new Response(JSON.stringify(data || { error: { message: "missing" } }), { status: data ? 200 : 404 });
  }));
});

describe("Basic Stripe price sync", () => {
  it("creates one product and recurring prices once, then reuses them", async () => {
    const first = await syncBasicStripePrices();
    expect(first).toEqual({ productId: "prod_basic", synced: 6, created: 6 });
    const second = await syncBasicStripePrices();
    expect(second).toEqual({ productId: "prod_basic", synced: 6, created: 0 });
    expect(calls.filter((c) => c.path === "products" && c.method === "POST")).toHaveLength(1);
    expect(calls.filter((c) => c.path === "prices" && c.method === "POST")).toHaveLength(6);
  });

  it("creates a new Price after an amount edit without changing the old Price", async () => {
    await syncBasicStripePrices();
    const before = await getTier();
    const oldPriceId = before.packages[0].stripePriceId;
    await saveTier("basic", { packages: before.packages.map((p, i) => i === 0 ? { ...p, priceCents: p.priceCents + 100, stripePriceId: null } : p) });
    const result = await syncBasicStripePrices();
    expect(result.created).toBe(1);
    expect((await getTier()).packages[0].stripePriceId).not.toBe(oldPriceId);
    expect(prices.get(oldPriceId!)?.unit_amount).toBe(before.packages[0].priceCents);
  });

  it("never creates prices while the sales switch is on", async () => {
    await saveTier("basic", { salesEnabled: true });
    await expect(syncBasicStripePrices()).rejects.toThrow("Pause sales");
    expect(calls).toHaveLength(0);
  });
});

describe("higher-tier Stripe price sync", () => {
  it("keeps all three tier products and package prices separate", async () => {
    for (const key of ["pro", "extreme"] as const) {
      await saveTier(key, { packages: [{ slots: 8, priceCents: key === "pro" ? 2499 : 3499, currency: "usd", enabled: true, order: 0, stripePriceId: null }] });
    }
    for (const key of ["basic", "pro", "extreme"] as const) await syncTierStripePrices(key);
    const tiers = await Promise.all((["basic", "pro", "extreme"] as const).map((key) => getTier(key)));
    expect(tiers.map((tier) => tier.stripeProductId)).toEqual(["prod_basic", "prod_pro", "prod_extreme"]);
    expect(new Set(tiers.map((tier) => tier.packages[0].stripePriceId)).size).toBe(3);
    expect(tiers.map((tier) => prices.get(tier.packages[0].stripePriceId!)?.product)).toEqual(["prod_basic", "prod_pro", "prod_extreme"]);
  });

  it.each(["pro", "extreme"] as const)("creates and reuses separate %s prices", async (key) => {
    await saveTier(key, { packages: [{ slots: 8, priceCents: 2499, currency: "usd", enabled: true, order: 0, stripePriceId: null }] });
    const first = await syncTierStripePrices(key);
    expect(first).toEqual({ productId: `prod_${key}`, synced: 1, created: 1 });
    expect(await syncTierStripePrices(key)).toEqual({ productId: `prod_${key}`, synced: 1, created: 0 });
    const saved = await getTier(key);
    expect(prices.get(saved.packages[0].stripePriceId!)?.product).toBe(`prod_${key}`);
    expect((await getTier("basic")).stripeProductId).toBeNull();
  });

  it("does not sync a higher tier while its sales switch is on", async () => {
    await saveTier("pro", { salesEnabled: true, packages: [{ slots: 8, priceCents: 2499, currency: "usd", enabled: true, order: 0, stripePriceId: null }] });
    await expect(syncTierStripePrices("pro")).rejects.toThrow("Pause sales");
    expect(calls).toHaveLength(0);
  });
});
