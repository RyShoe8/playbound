import assert from "node:assert/strict";
import test from "node:test";
import { catalogGameSupportsParty } from "./partyGameEligibility.js";

test("GOG ROM netplay games stay in the party picker", () => {
  for (const slug of ["baseball-stars-2", "soccer-brawl", "super-sidekicks"]) {
    assert.equal(catalogGameSupportsParty({
      slug,
      isMultiplayer: true,
      kind: "external",
      url: "goggalaxy://openGameView/2020914910",
      knownExePaths: ["C:\\GOG Games\\BASEBALL STARS 2\\bstars2.zip"],
    }), true, slug);
  }
});

test("a website-only external game cannot be selected for a launcher party", () => {
  assert.equal(catalogGameSupportsParty({ isMultiplayer: true, kind: "external", url: "https://example.org" }), false);
  assert.equal(catalogGameSupportsParty({ isMultiplayer: true, kind: "external", url: "goggalaxy://openGameView/123" }), false);
});

test("the site-provided party flag is authoritative", () => {
  assert.equal(catalogGameSupportsParty({ partyLaunchable: true, kind: "external" }), true);
  assert.equal(catalogGameSupportsParty({ partyLaunchable: false, isMultiplayer: true, kind: "direct-zip" }), false);
});
