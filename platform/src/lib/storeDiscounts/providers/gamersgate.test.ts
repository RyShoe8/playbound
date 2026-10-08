import { afterEach, describe, expect, it, vi } from "vitest";
import { GamersGateDiscountAdapter, parseGamersGateOffers } from "./gamersgate";

const card = (id: string, discount: number, current = "6.00", regular = "59.99") => `
<div class="column catalog-item product--item" data-id="${id}" data-name="Ryan&#x27;s Game" data-price="${current}" data-currency="USD" data-url="/product/ryans-game/">
  <div class="catalog-item--image" data-required-age="None"><a href="/product/ryans-game/"><img src="https://sttc.gamersgate.com/images/product/ryans-game/cover.jpg"></a></div>
  <div class="catalog-item--product-label product--label-discount for-list">-${discount}%</div>
  <div class="catalog-item--price"><span>$ ${current}</span><div class="catalog-item--full-price">$ ${regular}</div></div>
</div>`;

afterEach(() => vi.unstubAllGlobals());

describe("GamersGate offers", () => {
  it("extracts direct, affiliate-safe product deals from official sale cards", () => {
    const [deal] = parseGamersGateOffers(card("123", 90), 75);
    expect(deal).toMatchObject({
      externalId: "123",
      title: "Ryan's Game",
      store: "gamersgate",
      storeUrl: "https://www.gamersgate.com/product/ryans-game/",
      coverImage: "https://sttc.gamersgate.com/images/product/ryans-game/cover.jpg",
      currentPriceCents: 600,
      regularPriceCents: 5999,
      metadata: { directUrlAvailable: true },
    });
  });

  it("filters on actual prices, not the store's rounded badge", () => {
    expect(parseGamersGateOffers(card("123", 75, "7.51", "30.00"), 75)).toEqual([]);
  });

  it("does not treat broken markup as an empty sale", () => {
    expect(() => parseGamersGateOffers("<p>blocked</p>", 75)).toThrow(/no product cards/);
  });

  it("paginates to available pages and deduplicates product IDs", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      text: async () => `${card(url.includes("page=2") ? "2" : "1", 90)}<a data-page="2">2</a>`,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const deals = await new GamersGateDiscountAdapter().fetchDiscounts(75);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(deals.map((deal) => deal.externalId)).toEqual(["1", "2"]);
  });
});
