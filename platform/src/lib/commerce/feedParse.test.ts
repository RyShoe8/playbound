import { describe, it, expect } from "vitest";
import { parseProductFeed } from "./feedParse";

describe("parseProductFeed", () => {
  it("parses a CSV affiliate feed", () => {
    const rows = parseProductFeed(
      `title,url,price,id
The Elder Scrolls III: Morrowind,https://www.gog.com/game/morrowind,$14.99,mw
"Some, quoted",https://www.humblebundle.com/store/x,9.99,q1`
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "The Elder Scrolls III: Morrowind",
      url: "https://www.gog.com/game/morrowind",
      externalId: "mw",
      priceCents: 1499,
    });
    expect(rows[1]?.priceCents).toBe(999);
  });

  it("reads price_cents as cents, not dollars", () => {
    const rows = parseProductFeed(
      `name,product_url,price_cents
Morrowind,https://www.greenmangaming.com/games/morrowind/,1499`
    );
    expect(rows[0]?.priceCents).toBe(1499);
  });

  it("parses European semicolon CSV with comma decimals", () => {
    const rows = parseProductFeed(
      `title;url;price
Morrowind;https://www.gog.com/game/morrowind;14,99`
    );
    expect(rows[0]?.priceCents).toBe(1499);
  });

  it("parses a JSON product array", () => {
    const rows = parseProductFeed(
      JSON.stringify({
        products: [
          {
            title: "Morrowind",
            link: "https://www.humblebundle.com/store/morrowind",
            price: "19.99 USD",
            sku: "hum-1",
          },
        ],
      })
    );
    expect(rows).toEqual([
      {
        title: "Morrowind",
        url: "https://www.humblebundle.com/store/morrowind",
        externalId: "hum-1",
        priceCents: 1999,
        listPriceCents: 1999,
      },
    ]);
  });

  it("parses merchant RSS/XML items", () => {
    const rows = parseProductFeed(
      `<?xml version="1.0"?>
<rss><channel>
<item>
  <title><![CDATA[Morrowind]]></title>
  <link>https://www.gog.com/game/morrowind</link>
  <guid>gog-mw</guid>
  <price>14.99 USD</price>
</item>
</channel></rss>`,
      "application/xml"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Morrowind",
      url: "https://www.gog.com/game/morrowind",
      externalId: "gog-mw",
      priceCents: 1499,
    });
  });

  it("drops rows without an http product URL", () => {
    expect(
      parseProductFeed(`title,url,price
Morrowind,javascript:alert(1),9.99`)
    ).toEqual([]);
  });
});
