import { describe, expect, it } from "vitest";
import {
  ebayItemPriceCents,
  isEbayItemUrl,
  isEbaySearchUrl,
  lowestEbaySearchPriceCents,
  withEbayPriceSort,
} from "./ebayPrices";

const SEARCH_HTML = `
<ul>
  <li class="s-item s-item__pl-on-bottom">
    <div class="s-item__title">Shop on eBay</div>
    <span class="s-item__price">$20.00</span>
  </li>
  <li class="s-item s-item__pl-on-bottom">
    <a href="https://www.ebay.com/itm/111222333">Morrowind disk</a>
    <span class="s-item__price">$8.00</span>
    <span class="s-item__logisticsCost">+$3.99 shipping</span>
  </li>
  <li class="s-item s-item__pl-on-bottom">
    <a href="https://www.ebay.com/itm/444555666">Morrowind GOTY</a>
    <span class="s-item__price">$12.50</span>
    <span class="s-item__logisticsCost">Free shipping</span>
  </li>
</ul>
`;

describe("eBay URL shapes", () => {
  it("detects search vs item URLs", () => {
    expect(isEbaySearchUrl("https://www.ebay.com/sch/i.html?_nkw=morrowind")).toBe(true);
    expect(isEbaySearchUrl("https://www.ebay.com/itm/123456")).toBe(false);
    expect(isEbayItemUrl("https://www.ebay.com/itm/123456")).toBe(true);
  });

  it("adds lowest-price sort without dropping the query", () => {
    const sorted = withEbayPriceSort("https://www.ebay.com/sch/i.html?_nkw=morrowind");
    expect(sorted).toContain("_nkw=morrowind");
    expect(sorted).toContain("_sop=15");
    expect(withEbayPriceSort("https://www.ebay.com/sch/i.html?_nkw=x&_sop=12")).toContain("_sop=12");
  });
});

describe("lowestEbaySearchPriceCents", () => {
  it("skips the Shop on eBay card and picks the cheaper all-in price", () => {
    // $8 + $3.99 shipping = $11.99, vs $12.50 free shipping.
    expect(lowestEbaySearchPriceCents(SEARCH_HTML)).toBe(1199);
  });

  it("returns null when there are no real listings", () => {
    expect(
      lowestEbaySearchPriceCents(`
        <li class="s-item">
          <div class="s-item__title">Shop on eBay</div>
          <span class="s-item__price">$20.00</span>
        </li>
      `)
    ).toBeNull();
  });
});

describe("ebayItemPriceCents", () => {
  it("reads a product meta price", () => {
    expect(
      ebayItemPriceCents(`<meta property="product:price:amount" content="14.99">`)
    ).toBe(1499);
  });
});
