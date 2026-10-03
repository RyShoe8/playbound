import { describe, expect, it } from "vitest";
import { dedicatedOverviewSlugs } from "./adminOverviewGames";
import { ADD_GAME_FEATURES } from "../../../scripts/insert-catalog-wave.allowlist";

describe("dedicatedOverviewSlugs", () => {
  it("marks Battlefield Anthology for the database-backed VPS testing inventory", () => {
    expect(ADD_GAME_FEATURES["battlefield-1942-anthology"]).toContain("Dedicated Servers");
    expect(dedicatedOverviewSlugs([], {}, {}, ["battlefield-1942-anthology"]))
      .toContain("battlefield-1942-anthology");
  });
  it("includes Dedicated-only recipes even when their catalog games are unpublished", () => {
    expect(dedicatedOverviewSlugs(
      ["openra"],
      { openra: { installed: true }, "core-keeper": { installed: false }, terraria: { installed: true } },
      { rvgl: "re-volt-rvgl" }
    )).toEqual(["core-keeper", "openra", "terraria"]);
  });

  it("does not duplicate recipe aliases", () => {
    expect(dedicatedOverviewSlugs(
      ["morrowind"],
      { morrowind: {}, tes3mp: {} },
      { tes3mp: "morrowind" }
    )).toEqual(["morrowind"]);
  });

  it("includes catalog-only dedicated games and collapses legacy Counter-Strike 2 names", () => {
    expect(dedicatedOverviewSlugs(
      ["counter-strike-2"],
      { counterstrike2: { installed: true }, csgo: { installed: true } },
      { counterstrike2: "counter-strike-2", csgo: "counter-strike-2" },
      ["factorio", "counterstrike2", "csgo"]
    )).toEqual(["counter-strike-2", "factorio"]);
  });
});
