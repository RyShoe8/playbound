import { describe, expect, it } from "vitest";
import { gogSlugToQuery } from "./storePrices";
import {
  detectRetailer,
  parseFanaticalSlug,
  parseGogSlug,
  parseSteamAppId,
  retailerHasLivePrice,
  withStoreAffiliate,
} from "./storeUrls";

describe("detectRetailer", () => {
  it("maps storefront hosts", () => {
    expect(detectRetailer("https://store.steampowered.com/app/22330")).toBe("Steam");
    expect(
      detectRetailer("https://www.gog.com/en/game/the_elder_scrolls_iii_morrowind_goty_edition")
    ).toBe("GOG");
    expect(detectRetailer("https://store.epicgames.com/p/fortnite")).toBe("Epic Games Store");
    expect(detectRetailer("https://www.fanatical.com/en/game/foo")).toBe("Fanatical");
    expect(detectRetailer("https://www.humblebundle.com/store/foo")).toBe("Humble Bundle");
    expect(detectRetailer("https://bar.itch.io/foo")).toBe("itch.io");
    expect(detectRetailer("https://www.gamersgate.com/product/foo")).toBe("GamersGate");
    expect(detectRetailer("https://www.ebay.com/itm/123")).toBe("eBay");
    expect(detectRetailer("https://www.ebay.com/sch/i.html?_nkw=morrowind")).toBe("eBay");
    expect(detectRetailer("https://www.ebay.co.uk/itm/123")).toBe("eBay");
    expect(detectRetailer("https://example.com/x")).toBeNull();
  });
});

describe("retailerHasLivePrice", () => {
  it("is true for stores with a public price API", () => {
    expect(retailerHasLivePrice("Steam")).toBe(true);
    expect(retailerHasLivePrice("eBay")).toBe(false);
    expect(retailerHasLivePrice("Humble Bundle")).toBe(false);
  });
});

describe("withStoreAffiliate", () => {
  it("appends the param when the offer is affiliate", () => {
    expect(
      withStoreAffiliate("https://www.gog.com/game/morrowind", {
        affiliate: true,
        id: "playbound",
        param: "pp",
      })
    ).toBe("https://www.gog.com/game/morrowind?pp=playbound");
  });

  it("leaves a pasted affiliate URL and a non-affiliate offer alone", () => {
    const existing = "https://www.humblebundle.com/store/x?partner=other";
    expect(
      withStoreAffiliate(existing, { affiliate: true, id: "playbound", param: "partner" })
    ).toBe(existing);
    expect(
      withStoreAffiliate("https://www.gog.com/game/x", {
        affiliate: false,
        id: "playbound",
        param: "pp",
      })
    ).toBe("https://www.gog.com/game/x");
  });

  it("does nothing without an id or param", () => {
    expect(
      withStoreAffiliate("https://www.gog.com/game/x", { affiliate: true, id: "", param: "pp" })
    ).toBe("https://www.gog.com/game/x");
  });
});

describe("store URL parsers", () => {
  it("reads a Steam app id", () => {
    expect(parseSteamAppId("https://store.steampowered.com/app/22330/Morrowind/")).toBe("22330");
    expect(parseSteamAppId("https://www.gog.com/game/x")).toBeNull();
  });

  it("reads a GOG slug", () => {
    expect(
      parseGogSlug("https://www.gog.com/en/game/the_elder_scrolls_iii_morrowind_goty_edition")
    ).toBe("the_elder_scrolls_iii_morrowind_goty_edition");
    expect(parseGogSlug("https://www.gog.com/game/morrowind")).toBe("morrowind");
  });
});

describe("gogSlugToQuery", () => {
  /*
   * GOG's `like:` is a fuzzy search over titles, not a slug lookup. Sending the
   * raw slug for Ground Control 2 matched on the bare "2" and returned 732
   * products — Resident Evil 2, Metro 2033, Street Fighter Alpha 2 — with the
   * real game outside the returned page, so the exact-slug check downstream
   * could never succeed and a perfectly valid URL reported "no listing
   * matching that URL". As words the same search returns exactly one product.
   */
  it("turns a slug into the words GOG actually searches on", () => {
    expect(gogSlugToQuery("ground_control_2_operation_exodus")).toBe(
      "ground control 2 operation exodus"
    );
    expect(gogSlugToQuery("the_elder_scrolls_iii_morrowind_goty_edition")).toBe(
      "the elder scrolls iii morrowind goty edition"
    );
  });

  it("handles hyphenated and mixed separators", () => {
    expect(gogSlugToQuery("some-game_name")).toBe("some game name");
    expect(gogSlugToQuery("a__b--c")).toBe("a b c");
  });

  it("leaves a single-word slug alone and tolerates empty input", () => {
    expect(gogSlugToQuery("morrowind")).toBe("morrowind");
    expect(gogSlugToQuery("")).toBe("");
  });

  it("reads a Fanatical slug", () => {
    expect(parseFanaticalSlug("https://www.fanatical.com/en/game/some-title")).toBe("some-title");
  });
});
