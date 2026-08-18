import { describe, it, expect } from "vitest";
import type { Game } from "@/lib/data/types";
import { gamesRequiringMaster, masterCopyUnlocksEmpty } from "./masterCopy";

function game(partial: Partial<Game> & Pick<Game, "slug">): Game {
  return {
    title: partial.slug,
    tagline: "",
    description: "",
    developerSlug: "dev",
    genres: ["Strategy"],
    tags: [],
    license: "GPL",
    releaseYear: 2020,
    sizeMB: 1,
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
    ...partial,
  };
}

describe("gamesRequiringMaster", () => {
  it("returns published dependents and excludes the master itself", () => {
    const gold = game({ slug: "dungeon-keeper-gold" });
    const fx = game({
      slug: "keeperfx",
      access: {
        priceType: "PAID_BASE_GAME_REQUIRED",
        requiresGameSlugs: ["dungeon-keeper-gold"],
        currency: "USD",
        purchaseRequired: true,
        regularPriceCents: null,
        currentPriceCents: null,
        qualifyingPriceCents: null,
      },
    });
    const other = game({
      slug: "openmw",
      access: {
        priceType: "PAID_BASE_GAME_REQUIRED",
        requiresGameSlugs: ["morrowind"],
        currency: "USD",
        purchaseRequired: true,
        regularPriceCents: null,
        currentPriceCents: null,
        qualifyingPriceCents: null,
      },
    });

    expect(gamesRequiringMaster("dungeon-keeper-gold", [gold, fx, other]).map((g) => g.slug)).toEqual([
      "keeperfx",
    ]);
  });

  it("is empty when nothing lists the slug in Requires", () => {
    const gold = game({ slug: "dungeon-keeper-gold" });
    const fx = game({ slug: "keeperfx" });
    expect(gamesRequiringMaster("dungeon-keeper-gold", [gold, fx])).toEqual([]);
  });
});

describe("masterCopyUnlocksEmpty", () => {
  it("is true until games, editions, or mods are wired", () => {
    expect(masterCopyUnlocksEmpty({ games: [], editions: [], mods: [] })).toBe(true);
    expect(
      masterCopyUnlocksEmpty({ games: [game({ slug: "keeperfx" })], editions: [], mods: [] })
    ).toBe(false);
  });
});
