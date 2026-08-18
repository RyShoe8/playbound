import { describe, expect, it } from "vitest";
import {
  detectRetailer,
  parseFanaticalSlug,
  parseGogSlug,
  parseSteamAppId,
  retailerHasLivePrice,
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
    expect(detectRetailer("https://example.com/x")).toBeNull();
  });
});

describe("retailerHasLivePrice", () => {
  it("is true for stores with a public price API", () => {
    expect(retailerHasLivePrice("Steam")).toBe(true);
    expect(retailerHasLivePrice("Humble Bundle")).toBe(false);
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

  it("reads a Fanatical slug", () => {
    expect(parseFanaticalSlug("https://www.fanatical.com/en/game/some-title")).toBe("some-title");
  });
});
