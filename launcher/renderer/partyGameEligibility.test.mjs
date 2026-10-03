import assert from "node:assert/strict";
import test from "node:test";
import { catalogGameSupportsParty, catalogGameSupportsOnlineParty } from "./partyGameEligibility.js";

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

test("online card CTA uses isMultiplayer, not the legacy server-browser flag", () => {
  assert.equal(catalogGameSupportsOnlineParty({
    slug: "battlefield-1942-anthology", isMultiplayer: true,
    multiplayer: false, features: ["Multiplayer"],
  }), true);
  assert.equal(catalogGameSupportsOnlineParty({
    slug: "baseball-stars-2", isMultiplayer: true,
    multiplayer: false, features: ["Online Multiplayer"],
  }), true);
  assert.equal(catalogGameSupportsOnlineParty({
    isMultiplayer: false, multiplayer: true, features: ["Multiplayer"],
  }), false);
});

test("local-only co-op does not advertise an online party", () => {
  assert.equal(catalogGameSupportsOnlineParty({
    isMultiplayer: true, features: ["Co-op", "Couch Co-Op"],
  }), false);
  assert.equal(catalogGameSupportsOnlineParty({
    isMultiplayer: true, features: ["Co-op"],
  }), true);
});
