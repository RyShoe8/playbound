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
    expect(canonicalCatalogGameSlug("gradius-remake")).toBe("gradius");
    expect(canonicalCatalogGameSlug("gradius")).toBe("gradius");
    expect(canonicalCatalogGameSlug("metal-slug")).toBe("metal-slug-remake");
    expect(canonicalCatalogGameSlug("metal-slug-remake")).toBe("metal-slug-remake");
    expect(canonicalCatalogGameSlug("openlara")).toBe("tomb-raider-123");
    expect(canonicalCatalogGameSlug("openmohaa")).toBe("medal-of-honor-allied-assault");
    expect(canonicalCatalogGameSlug("re-volt")).toBe("re-volt-rvgl");
    expect(canonicalCatalogGameSlug("revolt")).toBe("re-volt-rvgl");
    expect(canonicalCatalogGameSlug("rvgl")).toBe("re-volt-rvgl");
    expect(canonicalCatalogGameSlug("re-volt-rvgl")).toBe("re-volt-rvgl");
    expect(canonicalCatalogGameSlug("wipeout")).toBe("wipeout-rewrite");
    expect(canonicalCatalogGameSlug("wipeout-phantom-edition")).toBe("wipeout-rewrite");
    expect(canonicalCatalogGameSlug("wipeout-rewrite")).toBe("wipeout-rewrite");
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
