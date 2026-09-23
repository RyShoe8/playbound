import { describe, it, expect } from "vitest";
import {
  cleanDealTitle,
  upgradeCoverImage,
  inferGameGenres,
  formatDetailedTimeLeft,
} from "./dealsShared";

describe("cleanDealTitle", () => {
  it("replaces underscores with spaces (e.g. Watch_Dogs 2 → Watch Dogs 2)", () => {
    expect(cleanDealTitle("Watch_Dogs 2")).toBe("Watch Dogs 2");
    expect(cleanDealTitle("Watch_Dogs")).toBe("Watch Dogs");
    expect(cleanDealTitle("Dead_Island_Riptide")).toBe("Dead Island Riptide");
  });

  it("strips trademark and copyright symbols (®, ™, ©)", () => {
    expect(cleanDealTitle("Tom Clancy's The Division® 2")).toBe("Tom Clancy's The Division 2");
    expect(cleanDealTitle("DOOM™ Eternal")).toBe("DOOM Eternal");
    expect(cleanDealTitle("Civilization© IV")).toBe("Civilization IV");
  });

  it("decodes and removes HTML entities (&amp;, &trade;, &reg;, &#39;)", () => {
    expect(cleanDealTitle("Command &amp; Conquer™ Remastered")).toBe("Command & Conquer Remastered");
    expect(cleanDealTitle("Sid Meier's Civilization&reg; VI")).toBe("Sid Meier's Civilization VI");
    expect(cleanDealTitle("Game&#39;s Name &quot;Edition&quot;")).toBe("Game's Name \"Edition\"");
  });

  it("collapses multiple consecutive spaces and trims whitespace", () => {
    expect(cleanDealTitle("  Super   Game   Title   ")).toBe("Super Game Title");
  });

  it("handles null, undefined, and empty string safely", () => {
    expect(cleanDealTitle(null)).toBe("");
    expect(cleanDealTitle(undefined)).toBe("");
    expect(cleanDealTitle("")).toBe("");
  });
});

describe("upgradeCoverImage", () => {
  it("constructs full Steam header image when steamAppId is supplied", () => {
    expect(upgradeCoverImage("https://example.com/thumb.jpg", "447040")).toBe(
      "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/447040/header.jpg"
    );
  });

  it("upgrades Steam capsule thumbnails to header.jpg", () => {
    expect(
      upgradeCoverImage(
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/447040/capsule_231x87.jpg?t=1751986887"
      )
    ).toBe("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/447040/header.jpg?t=1751986887");

    expect(
      upgradeCoverImage(
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/subs/75825/capsule_231x87.jpg"
      )
    ).toBe("https://shared.fastly.steamstatic.com/store_item_assets/steam/subs/75825/header.jpg");
  });

  it("returns non-steam image URLs unchanged", () => {
    const ggUrl = "https://sttc.gamersgate.com/images/product/some-game/cover-180.jpg";
    expect(upgradeCoverImage(ggUrl)).toBe(ggUrl);
  });

  it("handles null, undefined, and empty strings safely", () => {
    expect(upgradeCoverImage(null)).toBeNull();
    expect(upgradeCoverImage(undefined)).toBeNull();
    expect(upgradeCoverImage("   ")).toBeNull();
  });
});

describe("inferGameGenres", () => {
  it("preserves valid existing genres", () => {
    expect(inferGameGenres("Some Game", ["Indie", "Puzzle"])).toEqual(["Indie", "Puzzle"]);
  });

  it("identifies franchise genres correctly", () => {
    expect(inferGameGenres("Watch Dogs 2")).toEqual(["Action", "Adventure", "Open World"]);
    expect(inferGameGenres("Elden Ring")).toEqual(["Action", "RPG"]);
    expect(inferGameGenres("Sid Meier's Civilization VI")).toEqual(["Strategy", "Turn-Based", "4X"]);
    expect(inferGameGenres("Far Cry 6")).toEqual(["Action", "Adventure", "Shooter"]);
  });

  it("identifies keywords and simulator/tycoon patterns", () => {
    expect(inferGameGenres("Theme Park Tycoon")).toEqual(["Simulation", "Management"]);
    expect(inferGameGenres("Super Space Racing")).toEqual(["Racing"]);
    expect(inferGameGenres("Need for Speed Heat")).toEqual(["Racing"]);
    expect(inferGameGenres("Celeste")).toEqual(["Platformer", "Action"]);
    expect(inferGameGenres("Cyber Platformer 2000")).toEqual(["Platformer", "Action"]);
    expect(inferGameGenres("Horror of the Deep")).toEqual(["Action", "Horror"]);
    expect(inferGameGenres("High Fantasy Kingdom")).toEqual(["Fantasy", "RPG"]);
  });

  it("always returns 1 to 3 valid genres even for unknown titles", () => {
    const genres = inferGameGenres("Completely Obscure Title 12345");
    expect(genres.length).toBeGreaterThanOrEqual(1);
    expect(genres.length).toBeLessThanOrEqual(3);
    for (const g of genres) {
      expect(typeof g).toBe("string");
      expect(g.length).toBeGreaterThan(0);
    }
  });
});

describe("formatDetailedTimeLeft", () => {
  it("returns null for null, undefined, or past dates", () => {
    expect(formatDetailedTimeLeft(null)).toBeNull();
    expect(formatDetailedTimeLeft(undefined)).toBeNull();
    expect(formatDetailedTimeLeft("invalid-date")).toBeNull();
    const past = new Date(Date.now() - 60_000);
    expect(formatDetailedTimeLeft(past)).toBeNull();
  });

  it("formats days, hours, and minutes correctly", () => {
    // 3 days, 4 hours, 15 minutes in the future
    const future = new Date(Date.now() + (3 * 24 * 60 + 4 * 60 + 15) * 60 * 1000 + 5000);
    const result = formatDetailedTimeLeft(future);
    expect(result).toMatch(/^3d 4h (14|15)m left$/);
  });

  it("formats hours and minutes when under 24 hours", () => {
    const future = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000 + 5000);
    const result = formatDetailedTimeLeft(future);
    expect(result).toMatch(/^5h (29|30)m left$/);
  });

  it("formats minutes when under 1 hour", () => {
    const future = new Date(Date.now() + 45 * 60 * 1000 + 5000);
    const result = formatDetailedTimeLeft(future);
    expect(result).toMatch(/^(44|45)m left$/);
  });
});

