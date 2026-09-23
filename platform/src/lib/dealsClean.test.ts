import { describe, it, expect } from "vitest";
import { cleanDealTitle, upgradeCoverImage } from "./dealsShared";

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
