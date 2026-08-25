import { describe, it, expect } from "vitest";
import {
  filterGamesForParty,
  gamePlayableByAll,
  normalizePlatform,
  requiredPlatformsFor,
} from "./partyPlatforms";

const windowsOnly = { platforms: ["Windows"] };
const crossPlatform = { platforms: ["Windows", "macOS", "Linux"] };
const linuxOnly = { platforms: ["Linux"] };
const browserGame = { platforms: ["Web"], browserPlayable: true };

describe("party platform filtering", () => {
  it("derives the platforms a mixed party has to satisfy", () => {
    expect(requiredPlatformsFor(["windows", "linux"]).sort()).toEqual(["linux", "windows"]);
    // Duplicates collapse — two Windows players constrain the same as one.
    expect(requiredPlatformsFor(["windows", "windows"])).toEqual(["windows"]);
  });

  it("ignores members whose OS is unknown rather than narrowing the list", () => {
    /*
     * Presence only exists once someone opens the launcher, so an invited
     * member who has not opened it yet has no OS on record. Constraining on a
     * value we do not have would hide games for no reason.
     */
    expect(requiredPlatformsFor(["windows", "unknown"])).toEqual(["windows"]);
    expect(requiredPlatformsFor(["unknown", null, undefined])).toEqual([]);
    expect(requiredPlatformsFor([])).toEqual([]);
  });

  it("ignores mobile presence, which has no desktop games to constrain", () => {
    expect(requiredPlatformsFor(["ios", "android"])).toEqual([]);
    expect(requiredPlatformsFor(["windows", "ios"])).toEqual(["windows"]);
  });

  it("excludes a game a member's platform cannot run", () => {
    // The case that motivated this: Windows + Linux party, Windows-only game.
    expect(gamePlayableByAll(windowsOnly, ["windows", "linux"])).toBe(false);
    expect(gamePlayableByAll(linuxOnly, ["windows", "linux"])).toBe(false);
    expect(gamePlayableByAll(crossPlatform, ["windows", "linux"])).toBe(true);
  });

  it("keeps a single-platform game when the whole party is on that platform", () => {
    expect(gamePlayableByAll(windowsOnly, ["windows"])).toBe(true);
    expect(gamePlayableByAll(linuxOnly, ["linux"])).toBe(true);
  });

  it("always allows browser games", () => {
    // A browser is on every desktop, and the catalog flags these rather than
    // listing every platform.
    expect(gamePlayableByAll(browserGame, ["windows", "linux", "macos"])).toBe(true);
    expect(gamePlayableByAll({ platforms: ["Web"] }, ["windows", "linux"])).toBe(true);
  });

  it("keeps a game whose platforms are unrecorded", () => {
    /*
     * Missing data is not a statement of incompatibility. Hiding a game
     * because its catalog entry is thin looks to the leader like the game left
     * the catalog; the player still sees it is unsupported at install time.
     */
    expect(gamePlayableByAll({ platforms: [] }, ["windows", "linux"])).toBe(true);
    expect(gamePlayableByAll({}, ["windows", "linux"])).toBe(true);
    expect(gamePlayableByAll({ platforms: null }, ["windows"])).toBe(true);
  });

  it("does not constrain anything when no member OS is known", () => {
    expect(gamePlayableByAll(windowsOnly, [])).toBe(true);
    expect(filterGamesForParty([windowsOnly, linuxOnly], [])).toHaveLength(2);
  });

  it("normalises the spellings the catalog and presence each use", () => {
    // Catalog writes "macOS"; presence writes "macos".
    expect(normalizePlatform("macOS")).toBe("macos");
    expect(normalizePlatform("Windows")).toBe("windows");
    expect(normalizePlatform("OSX")).toBe("macos");
    expect(normalizePlatform("Mac")).toBe("macos");
    expect(normalizePlatform("Win")).toBe("windows");
    expect(normalizePlatform("  Linux  ")).toBe("linux");
  });

  it("filters a real mixed-party list down to what everyone can run", () => {
    const games = [windowsOnly, crossPlatform, linuxOnly, browserGame];
    const kept = filterGamesForParty(games, ["windows", "linux"]);
    expect(kept).toEqual([crossPlatform, browserGame]);
  });
});
