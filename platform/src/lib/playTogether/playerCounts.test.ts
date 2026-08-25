import { describe, expect, it } from "vitest";
import { defaultPartySize, gamePlayerCount } from "./playerCounts";

const CURRENT_TESTING_SLUGS = [
  "goldeneye-source", "populous-reincarnated", "bombsquad", "wolfenstein", "ryzom",
  "sky-children-of-the-light", "fishing-planet", "poppy-playtime", "trackmania",
  "goose-goose-duck", "idle-slayer", "among-us", "apex-legends", "hearthstone",
  "data-wing", "the-spike-cross", "poco", "ye-guild-clerk", "mekorama",
  "metal-slug-remake", "gradius", "panzer-marshal", "volleyball-legends",
  "c-dogs-retrarch", "sven-co-op", "teeworlds", "assaultcube", "bzflag", "openclonk",
  "red-eclipse", "widelands", "warfork", "slapshot-rebound", "deadeus", "openspades",
  "opentyrian-2000", "pokemon-dawn-of-darkness",
  "lincity-ng", "3d-city", "isocity", "tomb-raider-123",
  "stronghold-crusader-hd", "s-t-a-l-k-e-r-shadow-of-chernobyl", "s-t-a-l-k-e-r-call-of-pripyat",
  "star-wars-knights-of-the-old-republic", "star-wars-knights-of-the-old-republic-ii-the-sith-lords",
  "thief-gold", "thief-2-the-metal-age",
] as const;

describe("game player counts", () => {
  it("uses the actual social lobby caps", () => {
    expect(defaultPartySize("among-us")).toBe(15);
    expect(defaultPartySize("goose-goose-duck")).toBe(16);
    expect(defaultPartySize("apex-legends")).toBe(3);
    expect(defaultPartySize("populous-reincarnated")).toBe(4);
  });

  it("keeps MMO worlds finite at the PlayBound party layer", () => {
    expect(gamePlayerCount("ryzom")).toMatchObject({ max: null, partyMax: 20 });
  });

  it("preserves the legacy default for uncatalogued games", () => {
    expect(defaultPartySize("some-new-game")).toBe(8);
  });

  it("keeps the city builders out of multiplayer parties", () => {
    expect(gamePlayerCount("lincity-ng")).toEqual({ min: 1, max: 1, partyMax: 1 });
    expect(gamePlayerCount("3d-city")).toEqual({ min: 1, max: 1, partyMax: 1 });
    expect(gamePlayerCount("isocity")).toEqual({ min: 1, max: 1, partyMax: 1 });
    expect(gamePlayerCount("heroes-of-might-and-magic-3-complete")?.partyMax).toBe(8);
    expect(gamePlayerCount("ground-control-anthology")?.max).toBe(8);
    expect(gamePlayerCount("ground-control-2-operation-exodus")).toMatchObject({ max: 8, partyMax: 8 });
    expect(gamePlayerCount("stronghold-crusader-hd")).toMatchObject({ max: 8, partyMax: 8 });
    expect(gamePlayerCount("s-t-a-l-k-e-r-call-of-pripyat")?.partyMax).toBe(16);
  });

  it("has a verified count for every game currently in Testing", () => {
    expect(CURRENT_TESTING_SLUGS.filter((slug) => gamePlayerCount(slug) == null)).toEqual([]);
  });
});
