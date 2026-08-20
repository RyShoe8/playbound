import { describe, it, expect } from "vitest";
import { gameTitle, gameDescription, editionTitle, editionDescription } from "./seo";
import type { Game } from "./data/types";
import type { Edition } from "./editionTypes";

function createMockGame(overrides: Partial<Game> = {}): Game {
  return {
    slug: "mock-game",
    title: "Mock Game",
    tagline: "An exciting adventure in open worlds.",
    description: "Full description of Mock Game.",
    developerSlug: "mock-dev",
    genres: ["RPG"],
    tags: ["adventure", "co-op"],
    license: "Open Source (GPL-3.0)",
    releaseYear: 2023,
    sizeMB: 500,
    platforms: ["Windows", "Linux"],
    features: ["Multiplayer"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: true,
    website: "https://example.com",
    gameOfWeek: false,
    hiddenGem: false,
    art: { from: "#111", to: "#222", icon: "Gamepad2" },
    systemRequirements: { min: "8GB RAM", recommended: "16GB RAM" },
    qualityBar: {
      genuinelyFree: true,
      finished: true,
      activelyMaintained: true,
      standsAlone: true,
      highQuality: true,
      verdict: "Passes PlayBound Bar",
      lastVerified: "2024-01-01",
    },
    ...overrides,
  };
}

function createMockEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: "edition-1",
    gameSlug: "mock-game",
    slug: "community-edition",
    name: "Community Edition",
    shortDescription: "A custom community edition with enhanced balance and multiplayer.",
    description: "Detailed description of the community edition.",
    type: "community",
    status: "active",
    visibility: "public",
    sortOrder: 1,
    isDefault: false,
    branding: {},
    links: {},
    installMethod: "playbound_installer",
    installConfig: {},
    features: ["Custom Quests", "HD Textures"],
    tags: ["multiplayer"],
    aliases: [],
    languages: ["en"],
    patchNotes: [],
    faq: [],
    verified: true,
    verificationLevel: "playbound_verified",
    virtual: false,
    ...overrides,
  };
}

describe("Game SEO", () => {
  it("generates free titles and descriptions for free FOSS games", () => {
    const game = createMockGame({
      title: "Veloren",
      genres: ["RPG"],
      access: { priceType: "FREE", regularPriceCents: null, currentPriceCents: null, qualifyingPriceCents: null, currency: "USD", purchaseRequired: false },
    });

    const title = gameTitle(game);
    const desc = gameDescription(game);

    expect(title).toBe("Veloren — Free RPG");
    expect(desc).toContain("Veloren is a free RPG game for Windows, Linux.");
    expect(desc).toContain("Free forever, no pay-to-win");
  });

  it("omits 'free' claims for paid games", () => {
    const game = createMockGame({
      title: "The Elder Scrolls III: Morrowind",
      genres: ["RPG"],
      license: "Proprietary",
      access: { priceType: "PAID", regularPriceCents: 1499, currentPriceCents: 1499, qualifyingPriceCents: 1499, currency: "USD", purchaseRequired: true },
      qualityBar: undefined,
    });

    const title = gameTitle(game);
    const desc = gameDescription(game);

    expect(title).toBe("The Elder Scrolls III: Morrowind — RPG");
    expect(title).not.toContain("Free");
    expect(desc).toContain("The Elder Scrolls III: Morrowind is a RPG game for Windows, Linux.");
    expect(desc).not.toContain("free");
    expect(desc).not.toContain("Free");
  });

  it("handles games requiring paid base game assets", () => {
    const game = createMockGame({
      title: "DevilutionX",
      genres: ["Action"],
      access: { priceType: "PAID_BASE_GAME_REQUIRED", regularPriceCents: null, currentPriceCents: null, qualifyingPriceCents: null, currency: "USD", purchaseRequired: true, requiresBaseGameAssets: true },
    });

    const title = gameTitle(game);
    const desc = gameDescription(game);

    expect(title).toBe("DevilutionX — Action Engine");
    expect(desc).toContain("Requires original base game assets");
    expect(desc).not.toContain("Free forever");
  });
});

describe("Edition SEO", () => {
  it("formats edition titles avoiding game name duplication when already included", () => {
    const game = createMockGame({ title: "World of Warcraft", aliases: ["WoW"] });
    const edition = createMockEdition({ name: "Turtle WoW", type: "community" });

    expect(editionTitle(edition, game)).toBe("Turtle WoW — Community");
  });

  it("formats edition titles including game name when distinct", () => {
    const game = createMockGame({ title: "Morrowind" });
    const edition = createMockEdition({ name: "OpenMW", type: "remaster" });

    expect(editionTitle(edition, game)).toBe("OpenMW — Morrowind Remaster");
  });

  it("builds edition description with requirements and features", () => {
    const game = createMockGame({
      title: "Morrowind",
      access: { priceType: "PAID", regularPriceCents: 1499, currentPriceCents: 1499, qualifyingPriceCents: 1499, currency: "USD", purchaseRequired: true },
    });
    const edition = createMockEdition({
      name: "OpenMW",
      type: "remaster",
      shortDescription: "OpenMW is a modern open-source engine recreation of Morrowind.",
      features: ["Widescreen Support", "Modern Physics"],
      installMethod: "playbound_installer",
    });

    const desc = editionDescription(edition, game);

    expect(desc).toContain("OpenMW is a modern open-source engine recreation of Morrowind.");
    expect(desc).toContain("Requires Morrowind installation or game files.");
    expect(desc).toContain("Features Widescreen Support, Modern Physics.");
    expect(desc.length).toBeLessThanOrEqual(158);
  });

  it("fills in launcher install action when edition short description is brief", () => {
    const game = createMockGame({ title: "Morrowind" });
    const edition = createMockEdition({
      name: "OpenMW",
      type: "remaster",
      shortDescription: "OpenMW engine recreation.",
      features: [],
      installMethod: "playbound_installer",
    });

    const desc = editionDescription(edition, game);
    expect(desc).toContain("Install in one click with the PlayBound launcher.");
  });
});
