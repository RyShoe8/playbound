import { describe, it, expect } from "vitest";
import { gameAccessSchema, gamePayloadSchema, emptyGameDraft } from "./gamePayload";

describe("gameAccessSchema", () => {
  it("round-trips a paid game", () => {
    const parsed = gameAccessSchema.parse({
      priceType: "PAID",
      qualifyingPriceCents: 599,
      currentPriceCents: 499,
      regularPriceCents: 999,
    });
    expect(parsed.priceType).toBe("PAID");
    expect(parsed.purchaseRequired).toBe(true);
    expect(parsed.qualifyingPriceCents).toBe(599);
    expect(parsed.currency).toBe("USD");
  });

  it("treats a free engine that needs a base game as purchase-required", () => {
    const parsed = gameAccessSchema.parse({
      priceType: "PAID_BASE_GAME_REQUIRED",
      requiresBaseGameAssets: true,
      requiresGameSlugs: ["morrowind"],
    });
    expect(parsed.purchaseRequired).toBe(true);
    expect(parsed.requiresGameSlugs).toEqual(["morrowind"]);
  });

  it("derives current price from the cheapest active offer", () => {
    const parsed = gameAccessSchema.parse({
      priceType: "PAID",
      qualifyingPriceCents: 799,
      currentPriceCents: 999,
      offers: [
        {
          retailer: "Steam",
          url: "https://store.steampowered.com/app/22330",
          priceCents: 999,
        },
        {
          retailer: "GOG",
          url: "https://www.gog.com/en/game/the_elder_scrolls_iii_morrowind_goty_edition",
          priceCents: 349,
          affiliate: true,
        },
      ],
    });
    expect(parsed.currentPriceCents).toBe(349);
    expect(parsed.qualifyingPriceCents).toBe(799);
    expect(parsed.offers).toHaveLength(2);
    expect(parsed.offers[0]?.matchSource).toBe("manual");
    expect(parsed.offers[1]?.matchSource).toBe("manual");
  });

  it("keeps an auto match source on save", () => {
    const parsed = gameAccessSchema.parse({
      priceType: "PAID",
      qualifyingPriceCents: 599,
      offers: [
        {
          retailer: "Steam",
          url: "https://store.steampowered.com/app/22330",
          priceCents: 999,
          matchSource: "auto",
        },
      ],
    });
    expect(parsed.offers[0]?.matchSource).toBe("auto");
  });

  it("does not let offers rewrite a free game", () => {
    const parsed = gameAccessSchema.parse({
      priceType: "FREE",
      offers: [
        {
          retailer: "GOG",
          url: "https://www.gog.com/game/x",
          priceCents: 599,
        },
      ],
    });
    expect(parsed.offers).toEqual([]);
    expect(parsed.purchaseRequired).toBe(false);
  });

  it("drops incomplete purchase sources on save", () => {
    const parsed = gameAccessSchema.parse({
      priceType: "PAID",
      qualifyingPriceCents: 599,
      offers: [
        { retailer: "GOG", url: "", priceCents: 0 },
        {
          retailer: "Fanatical",
          url: "https://www.fanatical.com/en/game/x",
          priceCents: 349,
        },
      ],
    });
    expect(parsed.offers).toHaveLength(1);
    expect(parsed.offers[0]?.retailer).toBe("Fanatical");
    expect(parsed.currentPriceCents).toBe(349);
  });

  it("drops a draft source with no store instead of rejecting the save", () => {
    const parsed = gameAccessSchema.parse({
      priceType: "PAID",
      qualifyingPriceCents: 599,
      offers: [
        { retailer: "", url: "https://store.steampowered.com/app/22330", priceCents: 0 },
        {
          retailer: "Steam",
          url: "https://store.steampowered.com/app/22330",
          priceCents: 1499,
        },
      ],
    });
    expect(parsed.offers).toHaveLength(1);
    expect(parsed.offers[0]?.retailer).toBe("Steam");
  });
});

describe("gamePayloadSchema access", () => {
  it("accepts an unclassified draft with no access field", () => {
    const draft = emptyGameDraft();
    draft.slug = "0-ad";
    draft.title = "0 A.D.";
    draft.tagline = "RTS";
    draft.description = "A historical RTS.";
    const parsed = gamePayloadSchema.parse(draft);
    expect(parsed.access).toBeUndefined();
  });

  it("keeps access on a full payload", () => {
    const draft = emptyGameDraft();
    draft.slug = "morrowind";
    draft.title = "Morrowind";
    draft.tagline = "RPG";
    draft.description = "The third Elder Scrolls.";
    draft.access = gameAccessSchema.parse({
      priceType: "PAID",
      qualifyingPriceCents: 599,
      currentPriceCents: 599,
      regularPriceCents: 999,
    });
    const parsed = gamePayloadSchema.parse(draft);
    expect(parsed.access?.priceType).toBe("PAID");
    expect(parsed.access?.qualifyingPriceCents).toBe(599);
  });

  it("drops Multiplayer and Singleplayer from tags, and keeps Evil", () => {
    const draft = emptyGameDraft();
    draft.slug = "diablo";
    draft.title = "Diablo";
    draft.tagline = "ARPG";
    draft.description = "Hack and slash.";
    draft.tags = ["Classic", "Multiplayer", "Evil", "Singleplayer"];
    const parsed = gamePayloadSchema.parse(draft);
    expect(parsed.tags).toEqual(["Classic", "Evil"]);
  });
});
