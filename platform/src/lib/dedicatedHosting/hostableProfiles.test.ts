import { describe, expect, it } from "vitest";
import { hostableProfileStubs, readyPublishedHostableCatalog } from "./hostableProfiles";

describe("hostable profile stubs", () => {
  it("offers every hostable game's base profile when nothing is stored", () => {
    const keys = hostableProfileStubs([], []).map((s) => s.key);
    for (const key of ["openttd:base", "luanti:base", "freeciv:base", "ysoccer:base", "battle-for-wesnoth:base", "re-volt-rvgl:base"]) {
      expect(keys).toContain(key);
    }
  });

  it("does not repeat a stored profile or its edition", () => {
    const stubs = hostableProfileStubs(
      [{ key: "openra:base", gameSlug: "openra", editionSlug: null }, { key: "openra:combined-arms", gameSlug: "openra", editionSlug: "combined-arms" }],
      [{ gameSlug: "openra", slug: "combined-arms" }, { gameSlug: "openra", slug: "tiberian-dawn-hd" }]
    );
    const keys = stubs.map((s) => s.key);
    expect(keys).not.toContain("openra:base");
    expect(keys).not.toContain("openra:combined-arms");
    expect(keys).toContain("openra:tiberian-dawn-hd");
  });

  it("never lists an alias slug, and ignores editions of games that are not hostable", () => {
    const stubs = hostableProfileStubs([], [{ gameSlug: "not-a-hostable-game", slug: "x" }]);
    expect(stubs.some((s) => s.gameSlug === "0-ad" || s.gameSlug === "tes3mp")).toBe(false);
    expect(stubs.some((s) => s.gameSlug === "not-a-hostable-game")).toBe(false);
  });

  it("limits admin fallback profiles to games present in the database catalog", () => {
    const stubs = hostableProfileStubs([], [{ gameSlug: "openra", slug: "combined-arms" }], ["openarena"]);
    expect(stubs.map((profile) => profile.key)).toEqual(["openarena:base"]);
  });

  it("offers a database-tagged dedicated game before a code recipe is registered", () => {
    const stubs = hostableProfileStubs([], [], ["new-dedicated-game"]);
    expect(stubs.map((profile) => profile.key)).toEqual(["new-dedicated-game:base"]);
  });
});

describe("ready published hosting catalog", () => {
  it("keeps unready and unpublished games in VPS testing but out of enrollment", () => {
    const games = [
      { slug: "openra", title: "OpenRA", status: "published", published: true },
      { slug: "factorio", title: "Factorio", status: "testing", published: false },
      { slug: "terraria", title: "Terraria", status: "published", published: true },
    ];
    const editions = [
      { gameSlug: "openra", slug: "combined-arms", features: ["Dedicated Servers"] },
      { gameSlug: "openra", slug: "official", isDefault: true, features: ["Dedicated Servers"] },
      { gameSlug: "openra", slug: "singleplayer-mod", features: ["Singleplayer"] },
      { gameSlug: "factorio", slug: "modded", features: ["Dedicated Servers"] },
    ];
    const result = readyPublishedHostableCatalog(games, editions, [], new Set(["openra", "factorio"]));
    expect(result.games.map((game) => game.slug)).toEqual(["openra"]);
    expect(result.editions.map((edition) => edition.slug)).toEqual(["combined-arms"]);
  });
});
