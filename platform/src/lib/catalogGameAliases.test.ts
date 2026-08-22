import { describe, expect, it } from "vitest";
import {
  canonicalCatalogGameSlug,
  modBaseGameSlugsForCatalogGame,
  modDependsOnCatalogGameSlug,
} from "./catalogGameAliases";

describe("catalogGameAliases", () => {
  it("maps keeperfx and alephone to canonical catalog games", () => {
    expect(canonicalCatalogGameSlug("keeperfx")).toBe("dungeon-keeper-gold");
    expect(canonicalCatalogGameSlug("alephone")).toBe("marathon-2");
    expect(canonicalCatalogGameSlug("mindustry")).toBe("mindustry");
  });

  it("expands mod base slugs for party library lookups", () => {
    expect(modBaseGameSlugsForCatalogGame("marathon-2").sort()).toEqual(
      ["alephone", "marathon-2"].sort()
    );
    expect(modBaseGameSlugsForCatalogGame("dungeon-keeper-gold").sort()).toEqual(
      ["dungeon-keeper", "dungeon-keeper-gold", "keeperfx"].sort()
    );
  });

  it("resolves mod dependency slugs", () => {
    expect(modDependsOnCatalogGameSlug("keeperfx")).toBe("dungeon-keeper-gold");
    expect(modDependsOnCatalogGameSlug("alephone")).toBe("marathon-2");
  });
});
