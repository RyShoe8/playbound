import { describe, expect, it, vi, afterEach } from "vitest";
import { GogDiscountAdapter } from "./gog";

/**
 * `catalog.gog.com` sorts `discounted=true&order=desc:discount` deepest-first,
 * which is the whole reason pagination can stop early instead of walking
 * GOG's entire ~3,500-item discounted catalog. These tests pin that
 * stop-condition, the price parsing, and the mature-content filter — verified
 * against real GOG API responses during design; the fixtures below are
 * shaped exactly like those.
 */

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function product(over: Record<string, unknown> = {}) {
  return {
    id: "12345",
    slug: "some-game",
    title: "Some Game",
    storeLink: "https://www.gog.com/en/game/some-game",
    coverHorizontal: "https://images.gog-statics.com/cover.jpg",
    developers: ["Some Studio"],
    operatingSystems: ["windows", "osx"],
    genres: [{ name: "Adventure", slug: "adventure" }],
    price: {
      discount: "-90%",
      finalMoney: { amount: "1.99", currency: "USD" },
      baseMoney: { amount: "19.99" },
    },
    ratings: [],
    tags: [],
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GogDiscountAdapter", () => {
  it("maps a real-shaped GOG product to a DiscoveredDiscount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ pages: 1, products: [product()] }))
    );
    const [found] = await new GogDiscountAdapter().fetchDiscounts(75);
    expect(found).toMatchObject({
      externalId: "12345",
      title: "Some Game",
      store: "gog",
      storeUrl: "https://www.gog.com/en/game/some-game",
      coverImage: "https://images.gog-statics.com/cover.jpg",
      genres: ["Adventure"],
      developers: ["Some Studio"],
      platforms: ["Windows", "macOS"],
      currency: "USD",
      regularPriceCents: 1999,
      currentPriceCents: 199,
    });
  });

  it("stops paginating once a page's minimum discount drops below the bar", async () => {
    const page1 = jsonResponse({
      pages: 3,
      products: [product({ id: "1", price: { discount: "-90%", finalMoney: { amount: "1", currency: "USD" }, baseMoney: { amount: "10" } } })],
    });
    // Below the 75% bar — pagination must stop here and never fetch page 3.
    const page2 = jsonResponse({
      pages: 3,
      products: [product({ id: "2", price: { discount: "-50%", finalMoney: { amount: "5", currency: "USD" }, baseMoney: { amount: "10" } } })],
    });
    const fetchMock = vi.fn(async () => page1).mockImplementationOnce(async () => page1).mockImplementationOnce(async () => page2);
    vi.stubGlobal("fetch", fetchMock);

    const found = await new GogDiscountAdapter().fetchDiscounts(75);
    expect(found.map((d) => d.externalId)).toEqual(["1"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // page 1, then page 2 which triggers the stop — never page 3.
  });

  it("excludes an 18-rated or mature/NSFW-tagged product", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          pages: 1,
          products: [
            product({ id: "rated-18", ratings: [{ name: "gogRating", ageRating: "18" }] }),
            product({ id: "nsfw-tag", tags: [{ name: "NSFW", slug: "nsfw" }] }),
            product({ id: "clean" }),
          ],
        })
      )
    );
    const found = await new GogDiscountAdapter().fetchDiscounts(75);
    expect(found.map((d) => d.externalId)).toEqual(["clean"]);
  });

  it("excludes a $0 final price — that belongs in the free half, not here", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          pages: 1,
          products: [
            product({
              id: "giveaway",
              price: { discount: "-100%", finalMoney: { amount: "0.00", currency: "USD" }, baseMoney: { amount: "19.99" } },
            }),
          ],
        })
      )
    );
    expect(await new GogDiscountAdapter().fetchDiscounts(75)).toEqual([]);
  });

  it("throws on an HTTP failure rather than returning an empty list", async () => {
    // A thrown error keeps ingestion.ts from expiring existing rows; a silent
    // [] would look identical to "the store genuinely has nothing on sale".
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response));
    await expect(new GogDiscountAdapter().fetchDiscounts(75)).rejects.toThrow(/503/);
  });

  it("stops at MAX_PAGES rather than looping forever against a bad response", async () => {
    // Every page reports pages: 999 and a discount that never drops below the
    // bar — the loop must still terminate.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ pages: 999, products: [product({ price: { discount: "-95%", finalMoney: { amount: "1", currency: "USD" }, baseMoney: { amount: "20" } } })] }))
    );
    const found = await new GogDiscountAdapter().fetchDiscounts(75);
    // Bounded: some finite number of pages were read, not an infinite loop.
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThan(999);
  });
});
