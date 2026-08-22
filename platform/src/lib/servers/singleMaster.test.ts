import { describe, it, expect } from "vitest";
import {
  hasServerBrowser,
  hasServerProvider,
  isSingleMasterGame,
  listServerBrowserSlugs,
} from "./registry";

/**
 * Games whose provider reports one row that is not a server you pick.
 *
 * The property that matters is the pairing: dropped from the browser, kept in
 * the totals. Losing either half is a silent regression — a reappearing entry
 * in the selector, or a player count that quietly falls by a few thousand.
 */
const SINGLE_MASTER = ["triplea", "star-wars-galaxies"];

describe("single-master games", () => {
  it("are gone from the browser but still counted", () => {
    for (const slug of SINGLE_MASTER) {
      expect(isSingleMasterGame(slug), `${slug} should be flagged`).toBe(true);
      expect(hasServerBrowser(slug), `${slug} must not offer a browser`).toBe(false);
      // Totals sum over hasServerProvider, so this is what keeps their players
      // in the number on the homepage.
      expect(hasServerProvider(slug), `${slug} must keep its provider`).toBe(true);
    }
  });

  it("are absent from the slug list the launcher index reads", () => {
    // A list that disagreed with the predicate is how a dropped game comes back.
    const slugs = listServerBrowserSlugs();
    for (const slug of SINGLE_MASTER) {
      expect(slugs).not.toContain(slug);
    }
    expect(slugs.every((s) => hasServerBrowser(s))).toBe(true);
  });

  it("leaves games that merely look quiet alone", () => {
    /*
     * Counter-Strike 2 and Team Fortress 2 report a single row when the Steam
     * key is missing, because their provider falls back to a concurrent total.
     * That is an environment artifact, not a property of the game — excluding
     * them would drop two real server browsers.
     */
    for (const slug of ["counter-strike-2", "team-fortress-2"]) {
      expect(isSingleMasterGame(slug), `${slug} is not single-master`).toBe(false);
      expect(hasServerBrowser(slug), `${slug} keeps its browser`).toBe(true);
    }
  });

  it("keeps every multi-server game browsable", () => {
    for (const slug of ["openra", "luanti", "everquest", "old-school-runescape", "space-station-14"]) {
      expect(hasServerBrowser(slug), `${slug} should stay`).toBe(true);
    }
  });
});
