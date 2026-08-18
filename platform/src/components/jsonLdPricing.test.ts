import { describe, it, expect } from "vitest";
import { videoGameSchema } from "@/components/JsonLd";
import type { Game } from "@/lib/data/types";
import type { GameAccess } from "@/lib/access/types";

/**
 * Structured-data pricing.
 *
 * `isAccessibleForFree: true` and `price: "0"` used to be hardcoded for every
 * catalog game. That was a correct invariant while the catalog was free-only,
 * and becomes a false claim to search engines the moment a paid game is
 * published — the one kind of wrong that is served to third parties rather
 * than just shown on screen.
 */

const base = {
  slug: "test-game",
  title: "Test Game",
  tagline: "t",
  description: "d",
  developerSlug: "dev",
  genres: ["Strategy"],
  tags: [],
  license: "GPL",
  releaseYear: 2020,
  sizeMB: 100,
  platforms: ["Windows"],
  features: [],
  launchMethods: ["install"],
  browserPlayable: false,
  steamDeck: false,
  website: "https://example.com",
  gameOfWeek: false,
  hiddenGem: false,
  art: { from: "#000", to: "#fff", icon: "Gamepad2" },
  systemRequirements: { min: "-", recommended: "-" },
} as unknown as Game;

const withAccess = (access: GameAccess): Game => ({ ...base, access });

function offerOf(game: Game) {
  const schema = videoGameSchema(game) as Record<string, unknown>;
  return {
    free: schema.isAccessibleForFree as boolean,
    offer: schema.offers as Record<string, unknown>,
  };
}

describe("free games", () => {
  it("an unclassified game is still emitted as free", () => {
    // Every existing catalog row has no access field and genuinely is free.
    const { free, offer } = offerOf(base);
    expect(free).toBe(true);
    expect(offer.price).toBe("0.00");
  });

  it("an explicitly free game is emitted as free", () => {
    const { free, offer } = offerOf(
      withAccess({
        priceType: "FREE",
        regularPriceCents: 0,
        currentPriceCents: 0,
        qualifyingPriceCents: 0,
        currency: "USD",
        purchaseRequired: false,
      })
    );
    expect(free).toBe(true);
    expect(offer.price).toBe("0.00");
    expect(offer.seller).toBeDefined();
  });
});

describe("paid games", () => {
  const paid = withAccess({
    priceType: "PAID",
    regularPriceCents: 999,
    currentPriceCents: 499,
    qualifyingPriceCents: 599,
    currency: "USD",
    purchaseRequired: true,
  });

  it("is not claimed to be free", () => {
    expect(offerOf(paid).free).toBe(false);
  });

  it("quotes the qualifying price, not a temporary sale", () => {
    // 4.99 is today's discount; 5.99 is what it reliably costs.
    expect(offerOf(paid).offer.price).toBe("5.99");
  });

  it("does not name PlayBound as the seller", () => {
    // PlayBound is not where you buy it, so it must not claim to be.
    expect(offerOf(paid).offer.seller).toBeUndefined();
  });

  it("points the offer at a listed store when we have one", () => {
    const withStore = withAccess({
      ...paid.access!,
      offers: [
        {
          retailer: "GOG",
          url: "https://www.gog.com/game/x",
          priceCents: 499,
          affiliate: true,
          lastCheckedAt: null,
          isActive: true,
        },
      ],
    });
    expect(offerOf(withStore).offer.url).toBe("https://www.gog.com/game/x");
    // Schema still quotes qualifying, not the sale.
    expect(offerOf(withStore).offer.price).toBe("5.99");
  });

  it("a free-to-download game needing retail assets is not free", () => {
    const engine = withAccess({
      priceType: "PAID_BASE_GAME_REQUIRED",
      regularPriceCents: 0,
      currentPriceCents: 0,
      qualifyingPriceCents: 599,
      currency: "USD",
      purchaseRequired: true,
      requiresBaseGameAssets: true,
    });
    const { free, offer } = offerOf(engine);
    expect(free).toBe(false);
    expect(offer.price).toBe("5.99");
  });
});
