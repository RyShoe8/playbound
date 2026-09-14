import { describe, it, expect } from "vitest";
import type { Game } from "@/lib/data/types";
import {
  alternateEditionsUnlockedByMaster,
  gamesRequiringMaster,
  isEditionStandalone,
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

describe("isEditionStandalone", () => {
  it("recognizes explicit isStandalone: true", () => {
    const ed = { name: "Custom", shortDescription: "Mod", isStandalone: true } as Edition;
    expect(isEditionStandalone(ed)).toBe(true);
  });

  it("respects explicit isStandalone: false even if name mentions standalone", () => {
    const ed = { name: "Standalone Mod", shortDescription: "Addon", isStandalone: false } as Edition;
    expect(isEditionStandalone(ed)).toBe(false);
  });

  it("falls back to standalone substring in name or shortDescription if isStandalone is undefined", () => {
    const ed1 = { name: "Lost Alpha: Developer's Cut — Standalone", shortDescription: "" } as Edition;
    const ed2 = { name: "True Stalker", shortDescription: "Standalone story mod" } as Edition;
    const ed3 = { name: "OpenMW", shortDescription: "Requires Morrowind GOTY" } as Edition;

    expect(isEditionStandalone(ed1)).toBe(true);
    expect(isEditionStandalone(ed2)).toBe(true);
    expect(isEditionStandalone(ed3)).toBe(false);
  });

  it("requiresBaseDir always overrides standalone detection", () => {
    const ed = {
      name: "Standalone Overlay",
      shortDescription: "Standalone",
      installConfig: { playbound_installer: { requiresBaseDir: true } },
    } as Edition;
    expect(isEditionStandalone(ed)).toBe(false);
  });
});

describe("masterCopyUnlocksEmpty", () => {
  it("is true until games, editions, standalones, or mods are wired", () => {
    expect(
      masterCopyUnlocksEmpty({
        games: [],
        editions: [],
        standaloneGames: [],
        standaloneEditions: [],
        mods: [],
      })
    ).toBe(true);
    expect(
      masterCopyUnlocksEmpty({
        games: [game({ slug: "keeperfx" })],
        editions: [],
        standaloneGames: [],
        standaloneEditions: [],
        mods: [],
      })
    ).toBe(false);
    expect(
      masterCopyUnlocksEmpty({
        games: [],
        editions: [],
        standaloneGames: [game({ slug: "stalker-anomaly" })],
        standaloneEditions: [],
        mods: [],
      })
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
  it("sends catalog-shaped game cards with absolute covers and distinguishes standalones", () => {
    const fx = game({
      slug: "keeperfx",
      title: "KeeperFX",
      tagline: "Open-source Dungeon Keeper",
      coverImage: "/covers/fx.png",
      art: { from: "#111", to: "#222", icon: "Gamepad2" },
    });
    const anomaly = game({
      slug: "stalker-anomaly",
      title: "S.T.A.L.K.E.R. Anomaly",
      tagline: "Standalone sandbox",
      coverImage: "/covers/anomaly.png",
      art: { from: "#333", to: "#444", icon: "Gamepad2" },
    });
    const lostAlpha = {
      id: "soc-la",
      slug: "lost-alpha",
      name: "Lost Alpha: Developer's Cut — Standalone",
      type: "community",
      shortDescription: "Standalone overhaul",
      isDefault: false,
      isStandalone: true,
      branding: {},
    } as Edition;

    const payload = toLauncherUnlocks(
      {
        games: [fx],
        editions: [],
        standaloneGames: [anomaly],
        standaloneEditions: [{ game: game({ slug: "stalker-soc" }), edition: lostAlpha }],
        mods: [],
      },
      "https://playbound.club"
    );

    expect(payload.games).toEqual([
      expect.objectContaining({
        slug: "keeperfx",
        title: "KeeperFX",
        coverImage: "https://playbound.club/covers/fx.png",
      }),
    ]);
    expect(payload.standaloneGames).toEqual([
      expect.objectContaining({
        slug: "stalker-anomaly",
        title: "S.T.A.L.K.E.R. Anomaly",
        coverImage: "https://playbound.club/covers/anomaly.png",
      }),
    ]);
    expect(payload.standaloneEditions).toEqual([
      expect.objectContaining({
        editionSlug: "lost-alpha",
        editionName: "Lost Alpha: Developer's Cut — Standalone",
        isStandalone: true,
      }),
    ]);
    expect(payload.editions).toEqual([]);
    expect(payload.mods).toEqual([]);
  });
});

