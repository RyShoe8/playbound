import { describe, expect, it } from "vitest";
import { normalizeLfgGameSlugs } from "./lfgSelection";

describe("normalizeLfgGameSlugs", () => {
  it("keeps every unique game when more than six are selected", () => {
    const selected = Array.from({ length: 12 }, (_, index) => `game-${index + 1}`);

    expect(normalizeLfgGameSlugs(selected)).toEqual(selected);
  });

  it("trims slugs and removes empty and duplicate entries", () => {
    expect(normalizeLfgGameSlugs([" openra ", "", null, "openra", "0ad"])).toEqual([
      "openra",
      "0ad",
    ]);
  });
});
