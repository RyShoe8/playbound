import { describe, it, expect } from "vitest";
import type { Game } from "@/lib/data/types";
import {
  alternateEditionsUnlockedByMaster,
  gamesRequiringMaster,
  masterCopyUnlocksEmpty,
  toLauncherUnlocks,
} from "./masterCopy";
import type { Edition } from "./editionTypes";

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

describe("alternateEditionsUnlockedByMaster", () => {
  it("does not repeat the generated Official fallback as an unlocked edition", () => {
    const generatedOfficial = { slug: "official", name: "Official", virtual: true } as Edition;
    const storedAlternate = { slug: "open-engine", name: "Open Engine", virtual: false } as Edition;

    expect(alternateEditionsUnlockedByMaster([generatedOfficial, storedAlternate])).toEqual([
      storedAlternate,
    ]);
  });
});

describe("toLauncherUnlocks", () => {
  it("sends catalog-shaped game cards with absolute covers", () => {
    const fx = game({
      slug: "keeperfx",
      title: "KeeperFX",
      tagline: "Open-source Dungeon Keeper",
      coverImage: "/covers/fx.png",
      art: { from: "#111", to: "#222", icon: "Gamepad2" },
    });
    const payload = toLauncherUnlocks(
      { games: [fx], editions: [], mods: [] },
      "https://playbound.club"
    );
    expect(payload.games).toEqual([
      expect.objectContaining({
        slug: "keeperfx",
        title: "KeeperFX",
        tagline: "Open-source Dungeon Keeper",
        coverImage: "https://playbound.club/covers/fx.png",
        testing: false,
      }),
    ]);
    expect(payload.editions).toEqual([]);
    expect(payload.mods).toEqual([]);
  });
});
