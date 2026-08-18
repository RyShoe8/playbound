import { describe, it, expect } from "vitest";
import { FREE_ACCESS } from "@/lib/access/types";
import type { GameAccess } from "@/lib/access/types";
import type { GameTier } from "@/lib/access/tierMap";
import { FREE_TIER } from "@/lib/access/tierMap";
import { accessFieldsForLauncher, toLauncherCommerce } from "./launcherCommerce";

const paidAccess = (over: Partial<GameAccess> = {}): GameAccess => ({
  priceType: "PAID",
  regularPriceCents: 999,
  currentPriceCents: 599,
  qualifyingPriceCents: 799,
  currency: "USD",
  purchaseRequired: true,
  requiresGameSlugs: [],
  offers: [
    {
      retailer: "GOG",
      url: "https://www.gog.com/en/game/dungeon_keeper",
      priceCents: 599,
      affiliate: true,
      lastCheckedAt: null,
      isActive: true,
      matchSource: "manual",
    },
    {
      retailer: "Steam",
      url: "https://store.steampowered.com/app/123/",
      priceCents: 999,
      affiliate: false,
      lastCheckedAt: null,
      isActive: true,
      matchSource: "manual",
    },
  ],
  ...over,
});

const valueTier: GameTier = {
  tier: "VALUE",
  fromPriceCents: 599,
  qualifyingPriceCents: 799,
  requires: [
    {
      label: "Dungeon Keeper Gold",
      slug: "dungeon-keeper-gold",
      qualifyingPriceCents: 799,
      currentPriceCents: 599,
    },
  ],
};

describe("accessFieldsForLauncher", () => {
  it("defaults to FREE when the map has no entry", () => {
    expect(accessFieldsForLauncher(undefined)).toEqual({
      accessTier: "FREE",
      fromPriceCents: null,
    });
    expect(accessFieldsForLauncher(FREE_TIER).accessTier).toBe("FREE");
  });

  it("passes through VALUE and the card price", () => {
    expect(accessFieldsForLauncher(valueTier)).toEqual({
      accessTier: "VALUE",
      fromPriceCents: 599,
    });
  });
});

describe("toLauncherCommerce", () => {
  it("is empty for a free game", () => {
    const commerce = toLauncherCommerce({ slug: "openra", access: FREE_ACCESS }, FREE_TIER);
    expect(commerce.requiresPurchase).toBe(false);
    expect(commerce.buy).toBeNull();
    expect(commerce.sources).toEqual([]);
    expect(commerce.requires).toEqual([]);
  });

  it("stamps launcher UTM and affiliate ids on ready-to-open URLs", () => {
    const commerce = toLauncherCommerce(
      { slug: "dungeon-keeper-gold", access: paidAccess() },
      valueTier,
      { GOG: { id: "playbound", param: "pp" } }
    );
    expect(commerce.requiresPurchase).toBe(true);
    expect(commerce.buy?.retailer).toBe("GOG");
    expect(commerce.buy?.priceCents).toBe(599);
    expect(commerce.buy?.url).toContain("utm_medium=launcher");
    expect(commerce.buy?.url).toContain("utm_campaign=game_get");
    expect(commerce.buy?.url).toContain("pp=playbound");
    expect(commerce.sources).toHaveLength(2);
    expect(commerce.sources[0].retailer).toBe("GOG");
    expect(commerce.requires).toEqual([]);
  });

  it("points an engine at the paid original, not at itself", () => {
    const commerce = toLauncherCommerce(
      {
        slug: "keeperfx",
        access: {
          ...FREE_ACCESS,
          priceType: "PAID_BASE_GAME_REQUIRED",
          purchaseRequired: true,
        },
      },
      valueTier
    );
    expect(commerce.requiresPurchase).toBe(true);
    expect(commerce.buy).toBeNull();
    expect(commerce.requires).toEqual([
      { label: "Dungeon Keeper Gold", slug: "dungeon-keeper-gold", currentPriceCents: 599 },
    ]);
  });
});
