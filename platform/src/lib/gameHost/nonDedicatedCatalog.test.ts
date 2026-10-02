import { describe, expect, it } from "vitest";
import { isNonDedicatedCatalogGame } from "./nonDedicatedCatalog";

describe("dedicated server catalog exclusions", () => {
  it.each([
    ["asherons-call", "Asheron's Call"], ["beyond-all-reason", "Beyond All Reason"],
    ["city-of-heroes", "City of Heroes"], ["dragons-dogma-online", "Dragon's Dogma Online"],
    ["final-fantasy-xi", "Final Fantasy XI"], ["hawken-hawkening", "Hawken: Hawkening"],
    ["marathon-2", "Marathon 2"], ["monster-hunter-frontier", "Monster Hunter Frontier"],
    ["openspades", "OpenSpades"], ["planetside-2", "PlanetSide 2"],
    ["pokemmo", "PokeMMO"], ["pokemon-blaze-online", "Pokémon Blaze Online"],
    ["project-celeste", "Project Celeste"], ["red-eclipse", "Red Eclipse"],
    ["renegade-x", "Renegade X"], ["stalker-call-of-pripyat", "S.T.A.L.K.E.R.: Call of Pripyat"],
    ["stalker-clear-sky", "S.T.A.L.K.E.R.: Clear Sky"],
    ["stalker-shadow-of-chernobyl", "S.T.A.L.K.E.R.: Shadow of Chernobyl"],
    ["star-wars-galaxies", "Star Wars Galaxies"], ["starcraft", "StarCraft"], ["zero-k", "Zero-K"],
  ])("excludes %s even when tagged Dedicated Servers", (slug, title) => {
    expect(isNonDedicatedCatalogGame(slug)).toBe(true);
    expect(isNonDedicatedCatalogGame("unknown-slug", title)).toBe(true);
  });

  it("keeps real dedicated games visible", () => {
    for (const slug of ["openra", "factorio", "counter-strike-2", "openarena"]) {
      expect(isNonDedicatedCatalogGame(slug)).toBe(false);
    }
  });

  it("excludes City of Heroes variants from both catalog and agent inventory", () => {
    expect(isNonDedicatedCatalogGame("city-of-heroes-homecoming")).toBe(true);
    expect(isNonDedicatedCatalogGame("city-of-heroes-freedom")).toBe(true);
    expect(isNonDedicatedCatalogGame("city-of-heros")).toBe(true);
    expect(isNonDedicatedCatalogGame("some-cms-slug", "City of Heroes: Homecoming")).toBe(true);
    expect(isNonDedicatedCatalogGame("some-cms-slug", "City of Heroes Homecoming")).toBe(true);
    expect(isNonDedicatedCatalogGame("some-cms-slug", "City of Heroes: Rebirth")).toBe(true);
    expect(isNonDedicatedCatalogGame("heroes-of-the-city")).toBe(false);
  });

  it("does not offer StarCraft as a VPS dedicated game", () => {
    expect(isNonDedicatedCatalogGame("starcraft")).toBe(true);
    expect(isNonDedicatedCatalogGame("cms-remaster", "StarCraft: Remastered")).toBe(true);
  });
});
