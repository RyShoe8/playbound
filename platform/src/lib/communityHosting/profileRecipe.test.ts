import { describe, expect, it } from "vitest";
import { profileRecipeSlug } from "./profileRecipe";

describe("community hosting recipe selection", () => {
  it("uses Open Fortress's own server despite an old TF2 profile", () => {
    expect(profileRecipeSlug({ gameSlug: "team-fortress-2", editionSlug: "open-fortress", recipeSlug: "team-fortress-2" }))
      .toBe("open-fortress");
  });

  it("preserves the base TF2 server and a future database-only recipe", () => {
    expect(profileRecipeSlug({ gameSlug: "team-fortress-2", editionSlug: null, recipeSlug: "team-fortress-2" }))
      .toBe("team-fortress-2");
    expect(profileRecipeSlug({ gameSlug: "new-game", recipeSlug: "new-recipe" })).toBe("new-recipe");
  });
});
