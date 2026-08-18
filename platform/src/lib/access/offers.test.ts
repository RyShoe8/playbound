import { describe, it, expect } from "vitest";
import {
  bestPurchase,
  displayPriceCents,
  offerFromUnknown,
  offersFromUnknown,
  withDerivedCurrentPrice,
} from "./offers";
import type { GameAccess, RetailOffer } from "./types";

const paid = (offers: RetailOffer[], extra: Partial<GameAccess> = {}): GameAccess => ({
  priceType: "PAID",
  regularPriceCents: 999,
  currentPriceCents: 999,
  qualifyingPriceCents: 799,
  currency: "USD",
  purchaseRequired: true,
  offers,
  ...extra,
});

const offer = (partial: Partial<RetailOffer> & Pick<RetailOffer, "retailer" | "url" | "priceCents">): RetailOffer => ({
  affiliate: true,
  lastCheckedAt: null,
  isActive: true,
  ...partial,
});

describe("offerFromUnknown", () => {
  it("accepts a complete source", () => {
    expect(
      offerFromUnknown({
        retailer: "GOG",
        url: "https://www.gog.com/game/morrowind",
        priceCents: 599,
        affiliate: true,
        lastCheckedAt: "2026-08-17T00:00:00.000Z",
        isActive: true,
      })
    ).toMatchObject({ retailer: "GOG", priceCents: 599, affiliate: true });
  });

  it("drops javascript URLs and missing prices", () => {
    expect(offerFromUnknown({ retailer: "x", url: "javascript:alert(1)", priceCents: 100 })).toBeNull();
    expect(offerFromUnknown({ retailer: "GOG", url: "https://gog.com/x" })).toBeNull();
  });

  it("treats a missing affiliate flag as true", () => {
    const parsed = offerFromUnknown({
      retailer: "Fanatical",
      url: "https://www.fanatical.com/x",
      priceCents: 349,
    });
    expect(parsed?.affiliate).toBe(true);
    expect(parsed?.isActive).toBe(true);
  });
});

describe("bestPurchase", () => {
  it("picks the cheapest active source", () => {
    const access = paid([
      offer({ retailer: "Steam", url: "https://store.steampowered.com/app/22330", priceCents: 999 }),
      offer({ retailer: "GOG", url: "https://www.gog.com/game/morrowind", priceCents: 349 }),
    ]);
    expect(bestPurchase(access)?.retailer).toBe("GOG");
    expect(displayPriceCents(access)).toBe(349);
  });

  it("ignores inactive sources", () => {
    const access = paid([
      offer({
        retailer: "GOG",
        url: "https://www.gog.com/game/morrowind",
        priceCents: 199,
        isActive: false,
      }),
      offer({ retailer: "Steam", url: "https://store.steampowered.com/app/22330", priceCents: 599 }),
    ]);
    expect(bestPurchase(access)?.priceCents).toBe(599);
  });

  it("prefers an affiliate when two sources cost the same", () => {
    const access = paid([
      offer({
        retailer: "Steam",
        url: "https://store.steampowered.com/app/22330",
        priceCents: 599,
        affiliate: false,
      }),
      offer({
        retailer: "GOG",
        url: "https://www.gog.com/game/morrowind",
        priceCents: 599,
        affiliate: true,
      }),
    ]);
    expect(bestPurchase(access)?.retailer).toBe("GOG");
  });

  it("falls back to stored current then qualifying when there are no offers", () => {
    expect(displayPriceCents(paid([], { currentPriceCents: 449, qualifyingPriceCents: 799 }))).toBe(449);
    expect(displayPriceCents(paid([], { currentPriceCents: 0, qualifyingPriceCents: 799 }))).toBe(799);
  });
});

describe("withDerivedCurrentPrice", () => {
  it("rewrites current from the cheapest offer and leaves qualifying alone", () => {
    const next = withDerivedCurrentPrice(
      paid([offer({ retailer: "GOG", url: "https://www.gog.com/game/x", priceCents: 349 })], {
        currentPriceCents: 999,
        qualifyingPriceCents: 799,
      })
    );
    expect(next.currentPriceCents).toBe(349);
    expect(next.qualifyingPriceCents).toBe(799);
  });

  it("does not invent a current price when every source is inactive", () => {
    const next = withDerivedCurrentPrice(
      paid(
        [
          offer({
            retailer: "GOG",
            url: "https://www.gog.com/game/x",
            priceCents: 349,
            isActive: false,
          }),
        ],
        { currentPriceCents: 799 }
      )
    );
    expect(next.currentPriceCents).toBe(799);
  });
});

describe("offersFromUnknown", () => {
  it("skips junk rows instead of failing the game", () => {
    expect(
      offersFromUnknown([
        { retailer: "GOG", url: "https://www.gog.com/game/x", priceCents: 599 },
        { retailer: "", url: "https://example.com", priceCents: 1 },
        "nope",
      ])
    ).toHaveLength(1);
  });
});
