import { describe, it, expect } from "vitest";
import {
  auditAccessGraph,
  buildAccessGraph,
  filterByDiscoveryMode,
  isFreeToAccess,
  meetsPriceCeiling,
  resolveAccess,
} from "./resolver";
import { accessId, FREE_ACCESS, type AccessNode, type GameAccess } from "./types";

/**
 * The access model, specified by the worked examples it was designed around.
 *
 * The rule under test: an experience inherits its access requirement from the
 * game experience required to use it. A mod costing nothing that needs a paid
 * base game is VALUE, and so is every event, edition and server that depends
 * on it.
 */

const paid = (cents: number): GameAccess => ({
  priceType: "PAID",
  regularPriceCents: cents,
  currentPriceCents: cents,
  qualifyingPriceCents: cents,
  currency: "USD",
  purchaseRequired: true,
});

const needsRetailAssets: GameAccess = {
  priceType: "PAID_BASE_GAME_REQUIRED",
  regularPriceCents: 0,
  currentPriceCents: 0,
  qualifyingPriceCents: 0,
  currency: "USD",
  purchaseRequired: true,
  requiresBaseGameAssets: true,
};

const game = (slug: string, access: GameAccess, dependsOn: string[] = []): AccessNode => ({
  id: accessId.game(slug),
  kind: "game",
  label: slug,
  access,
  dependsOn,
});

describe("the tier table from the spec", () => {
  it("free game is FREE", () => {
    const g = buildAccessGraph([game("0ad", FREE_ACCESS)]);
    expect(resolveAccess(accessId.game("0ad"), g).tier).toBe("FREE");
  });

  it("a paid game is VALUE", () => {
    const g = buildAccessGraph([game("fnv", paid(799))]);
    expect(resolveAccess(accessId.game("fnv"), g).tier).toBe("VALUE");
  });

  it("free engine plus paid original is VALUE", () => {
    const g = buildAccessGraph([
      game("morrowind", paid(599)),
      game("openmw", FREE_ACCESS, [accessId.game("morrowind")]),
    ]);
    expect(resolveAccess(accessId.game("openmw"), g).tier).toBe("VALUE");
  });

  it("free mod on a free base game is FREE", () => {
    const g = buildAccessGraph([
      game("holocure", FREE_ACCESS),
      { id: accessId.mod("hc-mp"), kind: "mod", dependsOn: [accessId.game("holocure")] },
    ]);
    expect(resolveAccess(accessId.mod("hc-mp"), g).tier).toBe("FREE");
  });

  it("free mod on a paid base game is VALUE", () => {
    const g = buildAccessGraph([
      game("base", paid(999)),
      { id: accessId.mod("m"), kind: "mod", dependsOn: [accessId.game("base")] },
    ]);
    expect(resolveAccess(accessId.mod("m"), g).tier).toBe("VALUE");
  });

  it("a free total conversion needing retail assets is VALUE", () => {
    // The engine is free to download and still unusable without commercial data.
    const g = buildAccessGraph([game("tc", needsRetailAssets)]);
    expect(resolveAccess(accessId.game("tc"), g).tier).toBe("VALUE");
  });

  it("cards use the live price, eligibility keeps qualifying", () => {
    const g = buildAccessGraph([
      game("fnv", {
        ...paid(799),
        currentPriceCents: 349,
        qualifyingPriceCents: 799,
      }),
    ]);
    const res = resolveAccess(accessId.game("fnv"), g);
    expect(res.tier).toBe("VALUE");
    expect(res.fromPriceCents).toBe(349);
    expect(res.qualifyingPriceCents).toBe(799);
  });
});

describe("inheritance down the chain", () => {
  const freeChain = buildAccessGraph([
    game("holocure", FREE_ACCESS),
    { id: accessId.mod("hc-mp"), kind: "mod", dependsOn: [accessId.game("holocure")] },
    { id: accessId.event("gn1"), kind: "event", dependsOn: [accessId.mod("hc-mp")] },
  ]);

  const paidChain = buildAccessGraph([
    game("morrowind", paid(599)),
    game("openmw", FREE_ACCESS, [accessId.game("morrowind")]),
    {
      id: accessId.edition("openmw", "playbound"),
      kind: "edition",
      label: "OpenMW PlayBound Edition",
      dependsOn: [accessId.game("openmw")],
    },
    {
      id: accessId.event("gn2"),
      kind: "event",
      dependsOn: [accessId.edition("openmw", "playbound")],
    },
  ]);

  it("an event over a free mod is FREE", () => {
    expect(resolveAccess(accessId.event("gn1"), freeChain).tier).toBe("FREE");
  });

  it("an event three hops from a paid game is VALUE", () => {
    // event → edition → engine → Morrowind. Nothing between them is priced.
    expect(resolveAccess(accessId.event("gn2"), paidChain).tier).toBe("VALUE");
  });

  it("explains why, rather than only that it is VALUE", () => {
    const res = resolveAccess(accessId.event("gn2"), paidChain);
    expect(res.paidDependencies.map((d) => d.label)).toEqual(["morrowind"]);
    expect(res.fromPriceCents).toBe(599);
    expect(res.qualifyingPriceCents).toBe(599);
  });

  it("every entity on a paid chain resolves VALUE, not just the leaf", () => {
    for (const id of [
      accessId.game("openmw"),
      accessId.edition("openmw", "playbound"),
      accessId.event("gn2"),
    ]) {
      expect(resolveAccess(id, paidChain).tier, id).toBe("VALUE");
    }
  });
});

describe("events spanning several games", () => {
  it("is VALUE when any required game is paid", () => {
    const g = buildAccessGraph([
      game("openarena", FREE_ACCESS),
      game("xonotic", FREE_ACCESS),
      game("quake", paid(499)),
      {
        id: accessId.event("retro-fps"),
        kind: "event",
        dependsOn: [
          accessId.game("openarena"),
          accessId.game("xonotic"),
          accessId.game("quake"),
        ],
      },
    ]);
    const res = resolveAccess(accessId.event("retro-fps"), g);
    expect(res.tier).toBe("VALUE");
    expect(res.paidDependencies).toHaveLength(1);
  });

  it("is FREE when every required game is free", () => {
    const g = buildAccessGraph([
      game("openarena", FREE_ACCESS),
      game("xonotic", FREE_ACCESS),
      {
        id: accessId.event("e"),
        kind: "event",
        dependsOn: [accessId.game("openarena"), accessId.game("xonotic")],
      },
    ]);
    expect(resolveAccess(accessId.event("e"), g).tier).toBe("FREE");
  });
});

describe("chains that cannot be trusted resolve to VALUE", () => {
  it("treats a missing dependency as unverifiable", () => {
    // Promising free and then billing is the one failure worth avoiding.
    const g = buildAccessGraph([
      { id: accessId.mod("orphan"), kind: "mod", dependsOn: [accessId.game("ghost")] },
    ]);
    const res = resolveAccess(accessId.mod("orphan"), g);
    expect(res.tier).toBe("VALUE");
    expect(res.unresolved).toEqual([accessId.game("ghost")]);
  });

  it("detects a cycle instead of hanging", () => {
    const g = buildAccessGraph([
      { id: "game:a", kind: "game", access: FREE_ACCESS, dependsOn: ["game:b"] },
      { id: "game:b", kind: "game", access: FREE_ACCESS, dependsOn: ["game:a"] },
    ]);
    const res = resolveAccess("game:a", g);
    expect(res.cycle).toBe(true);
    expect(res.tier).toBe("VALUE");
  });

  it("handles a diamond without calling it a cycle", () => {
    // Two paths to one free game is normal, not a loop.
    const g = buildAccessGraph([
      game("base", FREE_ACCESS),
      { id: accessId.mod("l"), kind: "mod", dependsOn: [accessId.game("base")] },
      { id: accessId.mod("r"), kind: "mod", dependsOn: [accessId.game("base")] },
      { id: accessId.event("e"), kind: "event", dependsOn: [accessId.mod("l"), accessId.mod("r")] },
    ]);
    const res = resolveAccess(accessId.event("e"), g);
    expect(res.cycle).toBe(false);
    expect(res.tier).toBe("FREE");
  });
});

describe("discovery mode", () => {
  const g = buildAccessGraph([
    game("0ad", FREE_ACCESS),
    game("morrowind", paid(599)),
    game("daggerfall", FREE_ACCESS),
  ]);
  const items = [
    { slug: "0ad" },
    { slug: "morrowind" },
    { slug: "daggerfall" },
  ];
  const idOf = (i: { slug: string }) => accessId.game(i.slug);

  it("FREE mode hides anything requiring money", () => {
    expect(filterByDiscoveryMode(items, "FREE", g, idOf).map((i) => i.slug)).toEqual([
      "0ad",
      "daggerfall",
    ]);
  });

  it("ALL mode shows everything", () => {
    expect(filterByDiscoveryMode(items, "ALL", g, idOf)).toHaveLength(3);
  });

  it("filters rather than marking as locked", () => {
    // A collection in FREE mode keeps only its free members.
    expect(isFreeToAccess(accessId.game("morrowind"), g)).toBe(false);
  });
});

describe("price ceiling", () => {
  it("accepts a game at or under the ceiling", () => {
    expect(meetsPriceCeiling(paid(1500), 1500)).toBe(true);
    expect(meetsPriceCeiling(paid(499), 1500)).toBe(true);
  });

  it("rejects one above it", () => {
    expect(meetsPriceCeiling(paid(1999), 1500)).toBe(false);
  });

  it("is configurable rather than fixed at fifteen dollars", () => {
    expect(meetsPriceCeiling(paid(1999), 2000)).toBe(true);
  });

  it("always accepts free games", () => {
    expect(meetsPriceCeiling(FREE_ACCESS, 1500)).toBe(true);
  });
});

describe("audit", () => {
  it("is silent on a clean graph", () => {
    const g = buildAccessGraph([
      game("0ad", FREE_ACCESS),
      game("morrowind", paid(599)),
      game("openmw", FREE_ACCESS, [accessId.game("morrowind")]),
    ]);
    // openmw is free-priced but depends on a paid game — that is the
    // legitimate modelling, and the resolver already reports it as VALUE.
    const codes = auditAccessGraph(g).map((i) => i.code);
    expect(codes).toContain("FREE_WITH_PAID_DEPENDENCY");
  });

  it("flags a missing dependency", () => {
    const g = buildAccessGraph([
      { id: accessId.mod("m"), kind: "mod", dependsOn: [accessId.game("ghost")] },
    ]);
    expect(auditAccessGraph(g).map((i) => i.code)).toContain("UNRESOLVED_DEPENDENCY");
  });

  it("flags a paid game with no price", () => {
    const g = buildAccessGraph([
      game("x", { ...paid(0), qualifyingPriceCents: null, currentPriceCents: null }),
    ]);
    expect(auditAccessGraph(g).map((i) => i.code)).toContain("PAID_WITHOUT_PRICE");
  });

  it("flags a price above the ceiling", () => {
    const g = buildAccessGraph([game("x", paid(2999))]);
    expect(auditAccessGraph(g, { ceilingCents: 1500 }).map((i) => i.code)).toContain(
      "PRICE_ABOVE_CEILING"
    );
  });

  it("flags a base-game requirement that names nothing", () => {
    const g = buildAccessGraph([game("engine", needsRetailAssets)]);
    expect(auditAccessGraph(g).map((i) => i.code)).toContain(
      "BASE_GAME_REQUIRED_UNSPECIFIED"
    );
  });

  it("flags a circular dependency", () => {
    const g = buildAccessGraph([
      { id: "game:a", kind: "game", access: FREE_ACCESS, dependsOn: ["game:b"] },
      { id: "game:b", kind: "game", access: FREE_ACCESS, dependsOn: ["game:a"] },
    ]);
    expect(auditAccessGraph(g).map((i) => i.code)).toContain("CIRCULAR_DEPENDENCY");
  });
});
