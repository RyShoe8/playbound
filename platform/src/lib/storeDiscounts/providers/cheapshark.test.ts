import { describe, expect, it, vi, afterEach } from "vitest";
import { CheapSharkDiscountAdapter, createCheapSharkAdapter } from "./cheapshark";

/** Steam and Epic use CheapShark; GamersGate has a first-party offers adapter. */

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function deal(over: Record<string, unknown> = {}) {
  return {
    dealID: "deal-1",
    title: "Some Game",
    storeID: "1",
    gameID: "game-1",
    salePrice: "4.99",
    normalPrice: "19.99",
    steamAppID: "12345",
    thumb: "https://shared.akamai.steamstatic.com/thumb.jpg",
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CheapSharkDiscountAdapter — Steam", () => {
  it("builds a direct Steam URL from steamAppID, never CheapShark's redirect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([deal()])));
    const [found] = await createCheapSharkAdapter("steam").fetchDiscounts(75);
    expect(found.storeUrl).toBe("https://store.steampowered.com/app/12345/");
    expect(found.metadata.directUrlAvailable).toBe(true);
  });

  it("excludes a deal below the percent floor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([deal({ salePrice: "15.00", normalPrice: "19.99" })])) // ~25% off
    );
    expect(await createCheapSharkAdapter("steam").fetchDiscounts(75)).toEqual([]);
  });

  it("excludes a $0 sale price — that is a free-offers giveaway, not a discount", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([deal({ salePrice: "0.00" })])));
    expect(await createCheapSharkAdapter("steam").fetchDiscounts(75)).toEqual([]);
  });

  it("throws on a non-array response rather than silently returning nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "bad" })));
    await expect(createCheapSharkAdapter("steam").fetchDiscounts(75)).rejects.toThrow();
  });

  it("throws on an HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
    await expect(createCheapSharkAdapter("steam").fetchDiscounts(75)).rejects.toThrow(/500/);
  });
});

describe("CheapSharkDiscountAdapter — Epic (no affiliate program yet)", () => {
  it("falls back to CheapShark's redirect and flags it as not affiliate-safe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([deal({ storeID: "25", title: "Some Epic Game", steamAppID: null })]))
    );
    const [found] = await createCheapSharkAdapter("epic").fetchDiscounts(75);
    expect(found.storeUrl).toBe("https://www.cheapshark.com/redirect?dealID=deal-1");
    expect(found.metadata.directUrlAvailable).toBe(false);
  });
});

describe("CheapSharkDiscountAdapter — instance shape", () => {
  it("carries the requested store on the adapter instance", () => {
    expect(new CheapSharkDiscountAdapter("steam").store).toBe("steam");
    expect(new CheapSharkDiscountAdapter("epic").store).toBe("epic");
  });
});
