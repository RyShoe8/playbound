import { describe, expect, it, vi, afterEach } from "vitest";
import { CheapSharkDiscountAdapter, createCheapSharkAdapter } from "./cheapshark";

/**
 * Covers the two things this adapter has to get right beyond simple mapping:
 *
 *   1. Never send an affiliate click to CheapShark's own redirect for a store
 *      we have a real affiliate program on. GamersGate is that store today —
 *      its product URL is resolved from GamersGate's own site search, never
 *      from CheapShark. Epic, with no affiliate program configured, is the
 *      one case where CheapShark's redirect is an acceptable fallback, and it
 *      is flagged `directUrlAvailable: false` so `storeDiscounts/service.ts`
 *      knows never to affiliate-wrap it.
 *   2. Prefer an exact title match on GamersGate's search results over the
 *      first one — confirmed live that a search for "Elden Ring" returns
 *      "elden-ring-nightreign" (a different game) before "elden-ring".
 */

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function htmlResponse(html: string) {
  return { ok: true, status: 200, text: async () => html } as unknown as Response;
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

describe("CheapSharkDiscountAdapter — GamersGate (live affiliate program)", () => {
  const dealsFetch = () =>
    jsonResponse([deal({ storeID: "2", title: "Elden Ring", dealID: "gg-deal-1", steamAppID: null })]);

  it("resolves the exact product page over the first search result", async () => {
    const html = `
      <a href="/product/elden-ring-nightreign/">Elden Ring Nightreign</a>
      <a href="/product/elden-ring/">Elden Ring</a>
    `;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => dealsFetch())
      .mockImplementationOnce(async () => htmlResponse(html));
    vi.stubGlobal("fetch", fetchMock);

    const [found] = await createCheapSharkAdapter("gamersgate").fetchDiscounts(75);
    expect(found.storeUrl).toBe("https://www.gamersgate.com/product/elden-ring/");
    // A genuine gamersgate.com URL — always affiliate-wrappable.
    expect(found.metadata.directUrlAvailable).toBe(true);
  });

  it("falls back to the search results page, still first-party, when nothing matches exactly", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => dealsFetch())
      .mockImplementationOnce(async () => htmlResponse("<p>no results</p>"));
    vi.stubGlobal("fetch", fetchMock);

    const [found] = await createCheapSharkAdapter("gamersgate").fetchDiscounts(75);
    expect(found.storeUrl).toBe("https://www.gamersgate.com/games/?query=Elden%20Ring");
    expect(found.metadata.directUrlAvailable).toBe(true);
  });

  it("falls back to the search page rather than failing the whole store when the resolver errors", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => dealsFetch())
      .mockImplementationOnce(async () => {
        throw new Error("network blip");
      });
    vi.stubGlobal("fetch", fetchMock);

    const [found] = await createCheapSharkAdapter("gamersgate").fetchDiscounts(75);
    expect(found.storeUrl).toContain("gamersgate.com/games/?query=");
  });

  it("never uses CheapShark's own redirect for GamersGate", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => dealsFetch())
      .mockImplementationOnce(async () => htmlResponse("<p>no results</p>"));
    vi.stubGlobal("fetch", fetchMock);

    const [found] = await createCheapSharkAdapter("gamersgate").fetchDiscounts(75);
    expect(found.storeUrl).not.toContain("cheapshark.com");
  });
});

describe("CheapSharkDiscountAdapter — instance shape", () => {
  it("carries the requested store on the adapter instance", () => {
    expect(new CheapSharkDiscountAdapter("steam").store).toBe("steam");
    expect(new CheapSharkDiscountAdapter("gamersgate").store).toBe("gamersgate");
  });
});
