import { describe, it, expect } from "vitest";
import {
  parseDiscoveryMode,
  DEFAULT_DISCOVERY_MODE,
  tierVisibleIn,
  filterBySlugAccess,
  filterGamesByMode,
  filterCollectionsByMode,
  filterGamesByPrice,
  parsePriceFilter,
  accessPriceLabel,
  requiresGamePriceLine,
  scopeCatalogLiveStats,
} from "./discoveryMode";
import type { GameTierMap } from "./tierMap";

const tiers: GameTierMap = {
  morrowind: {
    tier: "VALUE",
    fromPriceCents: 599,
    qualifyingPriceCents: 599,
    requires: [],
  },
  openmw: {
    tier: "VALUE",
    fromPriceCents: 599,
    qualifyingPriceCents: 599,
    requires: [
      {
        label: "Morrowind",
        slug: "morrowind",
        qualifyingPriceCents: 599,
        currentPriceCents: 599,
      },
    ],
  },
  fnv: {
    tier: "VALUE",
    fromPriceCents: 499,
    qualifyingPriceCents: 499,
    requires: [],
  },
};

describe("parseDiscoveryMode", () => {
  it("accepts FREE and ALL", () => {
    expect(parseDiscoveryMode("FREE")).toBe("FREE");
    expect(parseDiscoveryMode("ALL")).toBe("ALL");
  });

  it("falls back to the platform default for anything else", () => {
    expect(parseDiscoveryMode(null)).toBe(DEFAULT_DISCOVERY_MODE);
    expect(parseDiscoveryMode("nope")).toBe(DEFAULT_DISCOVERY_MODE);
    expect(parseDiscoveryMode("")).toBe(DEFAULT_DISCOVERY_MODE);
  });
});

describe("tierVisibleIn", () => {
  it("shows everything in ALL", () => {
    expect(tierVisibleIn("FREE", "ALL")).toBe(true);
    expect(tierVisibleIn("VALUE", "ALL")).toBe(true);
  });

  it("hides VALUE in FREE", () => {
    expect(tierVisibleIn("FREE", "FREE")).toBe(true);
    expect(tierVisibleIn("VALUE", "FREE")).toBe(false);
  });
});

describe("filterBySlugAccess", () => {
  const items = [
    { name: "0 A.D.", slug: "0ad" },
    { name: "Morrowind", slug: "morrowind" },
    { name: "General", slug: null as string | null },
  ];

  it("keeps everything in ALL", () => {
    expect(filterBySlugAccess(items, "ALL", tiers, (i) => i.slug)).toEqual(items);
  });

  it("drops VALUE slugs in FREE and keeps empty-slug items", () => {
    expect(filterBySlugAccess(items, "FREE", tiers, (i) => i.slug).map((i) => i.name)).toEqual([
      "0 A.D.",
      "General",
    ]);
  });
});

describe("filterGamesByMode", () => {
  const games = [{ slug: "0ad" }, { slug: "morrowind" }, { slug: "openmw" }];

  it("drops VALUE in FREE", () => {
    expect(filterGamesByMode(games, "FREE", tiers).map((g) => g.slug)).toEqual(["0ad"]);
  });

  it("keeps VALUE in ALL", () => {
    expect(filterGamesByMode(games, "ALL", tiers)).toEqual(games);
  });
});

describe("scopeCatalogLiveStats", () => {
  const live = {
    gameCount: 3,
    modCount: 10,
    editionCount: 5,
    playingNow: 40,
    byGame: [
      { slug: "morrowind", title: "Morrowind", playingNow: 20 },
      { slug: "0ad", title: "0 A.D.", playingNow: 15 },
      { slug: "openmw", title: "OpenMW", playingNow: 5 },
    ],
    mostPopular: [
      { slug: "morrowind", title: "Morrowind", playingNow: 20 },
      { slug: "0ad", title: "0 A.D.", playingNow: 15 },
      { slug: "openmw", title: "OpenMW", playingNow: 5 },
    ],
    editionCountBySlug: { morrowind: 2, "0ad": 1, openmw: 2 },
    modCountBySlug: { morrowind: 8, "0ad": 2, openmw: 0 },
  };

  it("leaves ALL mode numbers alone", () => {
    expect(scopeCatalogLiveStats(live, "ALL", tiers)).toBe(live);
  });

  it("counts only FREE games, their players, editions, and mods", () => {
    const next = scopeCatalogLiveStats(live, "FREE", tiers);
    expect(next.gameCount).toBe(1);
    expect(next.playingNow).toBe(15);
    expect(next.editionCount).toBe(1);
    expect(next.modCount).toBe(2);
    expect(next.mostPopular.map((g) => g.slug)).toEqual(["0ad"]);
    expect(next.byGame.map((g) => g.slug)).toEqual(["0ad"]);
  });
});

describe("filterCollectionsByMode", () => {
  const collections = [
    { slug: "classic-rpgs", gameSlugs: ["daggerfall", "morrowind"] },
    { slug: "paid-only", gameSlugs: ["morrowind", "fnv"] },
    { slug: "free-rts", gameSlugs: ["0ad", "openra"] },
  ];

  it("filters contents and drops collections that empty out", () => {
    const next = filterCollectionsByMode(collections, "FREE", tiers);
    expect(next.map((c) => c.slug)).toEqual(["classic-rpgs", "free-rts"]);
    expect(next.find((c) => c.slug === "classic-rpgs")?.gameSlugs).toEqual(["daggerfall"]);
  });

  it("leaves collections alone in ALL", () => {
    expect(filterCollectionsByMode(collections, "ALL", tiers)).toEqual(collections);
  });
});

describe("price filter", () => {
  const games = [{ slug: "0ad" }, { slug: "morrowind" }, { slug: "fnv" }];

  it("parses known values and defaults to any", () => {
    expect(parsePriceFilter("under10")).toBe("under10");
    expect(parsePriceFilter("nope")).toBe("any");
  });

  it("free keeps $0 games only", () => {
    expect(filterGamesByPrice(games, "free", tiers).map((g) => g.slug)).toEqual(["0ad"]);
  });

  it("under5 keeps free games and titles at or under $5", () => {
    expect(filterGamesByPrice(games, "under5", tiers).map((g) => g.slug)).toEqual(["0ad", "fnv"]);
  });

  it("under10 includes Morrowind at $5.99", () => {
    expect(filterGamesByPrice(games, "under10", tiers).map((g) => g.slug)).toEqual([
      "0ad",
      "morrowind",
      "fnv",
    ]);
  });
});

describe("price labels", () => {
  it("says FREE when there is no qualifying price", () => {
    expect(accessPriceLabel(null)).toBe("FREE");
    expect(accessPriceLabel(0)).toBe("FREE");
  });

  it("says $x.xx for a paid chain, without FROM", () => {
    expect(accessPriceLabel(599)).toBe("$5.99");
    expect(accessPriceLabel(349)).toBe("$3.49");
  });

  it("explains a paid requirement on a free mod", () => {
    expect(requiresGamePriceLine("Morrowind", 599)).toBe("Requires Morrowind — $5.99");
    expect(requiresGamePriceLine("0 A.D.", null)).toBeNull();
  });
});
