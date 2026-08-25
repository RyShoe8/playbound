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

  /*
   * Anything but a lone exact match or a lone hit used to be abandoned, so a
   * search returning the game alongside its DLC or a bundle matched nothing
   * even when one result was plainly right — which is most searches, and why
   * so many of these ended up pasted by hand.
   */
  it("picks a clear winner from several candidates", () => {
    const chosen = pickUniqueHit("Morrowind", [
      hit("The Elder Scrolls III Morrowind"), // 60, a substring
      hit("Morrowind GOTY"), // 80, a prefix
    ]);
    expect(chosen?.title).toBe("Morrowind GOTY");
  });

  it("still refuses when two candidates are equally plausible", () => {
    // Both prefix matches: nothing separates them, so a person decides.
    expect(
      pickUniqueHit("Morrowind", [hit("Morrowind GOTY"), hit("Morrowind Deluxe")])
    ).toBeNull();
  });

  it("does not promote a weak leader just because it is ahead", () => {
    // Top is only a substring match; leading the field does not make it right.
    expect(
      pickUniqueHit("Morrowind", [
        hit("The Elder Scrolls III Morrowind"),
        hit("Something Unrelated"),
      ])
    ).toBeNull();
  });
});
