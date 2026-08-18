import { describe, it, expect } from "vitest";
import { gameTiersFromRows, tierFor, FREE_TIER } from "./tiers";
import type { AccessDoc } from "./docs";

/**
 * The games-only tier map.
 *
 * The resolver itself is covered in `resolver.test.ts`; what is asserted here
 * is the projection onto slugs that listing pages actually consume — including
 * the deliberate omission of free games from the map, which is easy to mistake
 * for a bug when reading the output.
 */

const free = (slug: string): AccessDoc => ({ slug, title: slug });

const paid = (slug: string, qualifyingPriceCents: number): AccessDoc => ({
  slug,
  title: slug,
  access: {
    priceType: "PAID",
    regularPriceCents: qualifyingPriceCents,
    currentPriceCents: qualifyingPriceCents,
    qualifyingPriceCents,
    purchaseRequired: true,
  },
});

/** A free engine that cannot run without a commercial game's files. */
const needsBase = (slug: string, requiresGameSlugs: string[]): AccessDoc => ({
  slug,
  title: slug,
  access: {
    priceType: "PAID_BASE_GAME_REQUIRED",
    purchaseRequired: true,
    requiresBaseGameAssets: true,
    requiresGameSlugs,
  },
});

describe("tier map", () => {
  it("leaves free games out of the map entirely", () => {
    const map = gameTiersFromRows([free("0ad"), free("openra")]);
    expect(map).toEqual({});
  });

  it("still reports free for a slug that is not in the map", () => {
    const map = gameTiersFromRows([free("0ad")]);
    expect(tierFor(map, "0ad")).toEqual(FREE_TIER);
    expect(tierFor(map, "never-heard-of-it").tier).toBe("FREE");
  });

  it("records a paid game with its qualifying price", () => {
    const map = gameTiersFromRows([paid("morrowind", 599)]);
    expect(map.morrowind).toMatchObject({
      tier: "VALUE",
      fromPriceCents: 599,
      qualifyingPriceCents: 599,
    });
  });

  it("uses the live offer price on cards without changing eligibility", () => {
    const map = gameTiersFromRows([
      {
        slug: "fnv",
        title: "Fallout: New Vegas",
        access: {
          priceType: "PAID",
          regularPriceCents: 999,
          currentPriceCents: 349,
          qualifyingPriceCents: 799,
          purchaseRequired: true,
        },
      },
    ]);
    expect(map.fnv?.fromPriceCents).toBe(349);
    expect(map.fnv?.qualifyingPriceCents).toBe(799);
  });

  it("carries the paid dependency through to a free engine", () => {
    // OpenMW costs nothing and is still not free to play.
    const map = gameTiersFromRows([paid("morrowind", 599), needsBase("openmw", ["morrowind"])]);
    expect(map.openmw?.tier).toBe("VALUE");
    expect(map.openmw?.fromPriceCents).toBe(599);
    expect(map.openmw?.requires.map((r) => r.label)).toContain("morrowind");
  });

  it("does not drag an unrelated free game into VALUE", () => {
    const map = gameTiersFromRows([
      paid("morrowind", 599),
      needsBase("openmw", ["morrowind"]),
      free("0ad"),
    ]);
    expect(tierFor(map, "0ad").tier).toBe("FREE");
  });

  it("treats a dependency missing from the catalog as VALUE", () => {
    // Unverifiable must never resolve free — that is the direction a mistake
    // here has to fail in.
    const map = gameTiersFromRows([needsBase("openmw", ["a-game-we-do-not-have"])]);
    expect(map.openmw?.tier).toBe("VALUE");
  });

  it("survives a dependency cycle without hanging", () => {
    const map = gameTiersFromRows([
      needsBase("a", ["b"]),
      needsBase("b", ["a"]),
    ]);
    expect(map.a?.tier).toBe("VALUE");
    expect(map.b?.tier).toBe("VALUE");
  });

  it("ignores rows with no slug", () => {
    expect(gameTiersFromRows([{ title: "orphan" }, paid("morrowind", 599)])).toHaveProperty(
      "morrowind"
    );
  });
});
