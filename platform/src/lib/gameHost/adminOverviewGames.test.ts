import { describe, expect, it } from "vitest";
import { dedicatedOverviewSlugs } from "./adminOverviewGames";

describe("dedicatedOverviewSlugs", () => {
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
});
