import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

vi.mock("@/lib/db", () => ({ default: async () => undefined }));

import DedicatedHostingTier from "@/lib/models/DedicatedHostingTier";
import { getTier, saveTier } from "./tier";
import { syncBasicStripePrices } from "./stripePrices";

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
    if (path === "products" && init.method === "POST") data = { id: "prod_basic", active: true };
    else if (path === "products/prod_basic") data = { id: "prod_basic", active: true };
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
