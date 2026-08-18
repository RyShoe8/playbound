import { describe, it, expect } from "vitest";
import { pickUniqueHit } from "./matchCatalog";
import { scoreTitleMatch, type StoreSearchHit } from "./storeSearch";

function hit(title: string, extra: Partial<StoreSearchHit> = {}): StoreSearchHit {
  return {
    store: "gog",
    retailer: "GOG",
    title,
    url: `https://www.gog.com/game/${title.toLowerCase().replace(/\s+/g, "_")}`,
    externalId: title,
    priceCents: 1499,
    listPriceCents: 1499,
    ...extra,
  };
}

describe("scoreTitleMatch", () => {
  it("scores an exact title 100 after normalizing", () => {
    expect(scoreTitleMatch("The Elder Scrolls III: Morrowind", "The Elder Scrolls III Morrowind")).toBe(
      100
    );
  });

  it("scores a prefix 80 and a contained title 60", () => {
    expect(scoreTitleMatch("Morrowind", "Morrowind Game of the Year")).toBe(80);
    expect(scoreTitleMatch("Morrowind", "The Elder Scrolls III Morrowind")).toBe(60);
  });
});

describe("pickUniqueHit", () => {
  it("returns the one exact title", () => {
    const chosen = pickUniqueHit("Morrowind", [
      hit("Morrowind"),
      hit("Morrowind Overhaul"),
    ]);
    expect(chosen?.title).toBe("Morrowind");
  });

  it("returns null when two listings share the exact title", () => {
    expect(
      pickUniqueHit("Morrowind", [
        hit("Morrowind", { url: "https://www.gog.com/game/morrowind" }),
        hit("Morrowind", { url: "https://www.gog.com/game/morrowind_goty" }),
      ])
    ).toBeNull();
  });

  it("accepts a single high-confidence prefix when there is only one hit", () => {
    expect(pickUniqueHit("Morrowind", [hit("Morrowind GOTY")])?.title).toBe("Morrowind GOTY");
  });

  it("does not guess when the only hit is a weak contain", () => {
    expect(pickUniqueHit("Morrowind", [hit("The Elder Scrolls III Morrowind")])).toBeNull();
  });

  it("returns null when there are no hits", () => {
    expect(pickUniqueHit("Morrowind", [])).toBeNull();
  });
});
