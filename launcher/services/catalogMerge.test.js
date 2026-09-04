/**
 * Catalog reconciliation.
 *
 * The launcher unioned its bundled list, its disk cache and the live feed into
 * one map, then wrote the union back to the cache. A slug therefore only had to
 * appear once, anywhere, to survive forever — and the cache re-seeded itself on
 * every refresh. Unpublishing a game or renaming its slug left the old entry on
 * the games page permanently, and shipping a corrected catalog.js could not
 * clear it.
 *
 * Run: node services/catalogMerge.test.js
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { reconcileCatalog, startupCatalog } = require("./catalogMerge");

const g = (slug, extra = {}) => ({ slug, title: slug, ...extra });

test("a game removed upstream disappears", () => {
  const { games, removed } = reconcileCatalog({
    remote: [g("openra"), g("openttd")],
    cached: [g("openra"), g("openttd"), g("drafted-game")],
    bundled: [g("openra"), g("openttd"), g("drafted-game")],
  });
  assert.deepEqual(
    games.map((e) => e.slug),
    ["openra", "openttd"]
  );
  assert.deepEqual(removed, ["drafted-game"]);
});

test("a renamed slug does not leave its old self behind", () => {
  // The TinyWind case: renamed upstream, old slug lingering in both fallbacks.
  const { games, removed } = reconcileCatalog({
    remote: [g("tinywind")],
    cached: [g("tinywind-pixel-pirate-sailing-game")],
    bundled: [g("tinywind-pixel-pirate-sailing-game"), g("tinywind")],
  });
  assert.deepEqual(
    games.map((e) => e.slug),
    ["tinywind"]
  );
  assert.ok(removed.includes("tinywind-pixel-pirate-sailing-game"));
});

test("fields still come from the fallbacks when the feed omits them", () => {
  const { games } = reconcileCatalog({
    remote: [g("openra", { title: "OpenRA" })],
    cached: [g("openra", { coverImage: "/cached.webp" })],
    bundled: [g("openra", { coverImage: "/bundled.webp", exeHint: "openra" })],
  });
  assert.equal(games[0].title, "OpenRA", "remote wins on fields it provides");
  assert.equal(games[0].coverImage, "/cached.webp", "cache beats bundled");
  assert.equal(games[0].exeHint, "openra", "bundled fills what neither has");
});

test("an empty feed is treated as no answer, not as no games", () => {
  // A bad response must never wipe the catalog.
  const { games, removed } = reconcileCatalog({
    remote: [],
    cached: [g("openra")],
    bundled: [g("openra")],
  });
  assert.equal(games, null);
  assert.deepEqual(removed, []);
});

test("entries without a slug are ignored", () => {
  const { games } = reconcileCatalog({
    remote: [g("openra"), { title: "no slug" }, null],
    cached: [],
    bundled: [],
  });
  assert.deepEqual(
    games.map((e) => e.slug),
    ["openra"]
  );
});

test("startup prefers the cache, which is the last known live list", () => {
  const games = startupCatalog({
    cached: [g("openra"), g("openttd")],
    bundled: [g("openra"), g("openttd"), g("drafted-game")],
  });
  assert.deepEqual(
    games.map((e) => e.slug),
    ["openra", "openttd"],
    "a stale bundled slug must not reappear before the first refresh"
  );
});

test("startup falls back to bundled when nothing has been cached", () => {
  const games = startupCatalog({ cached: null, bundled: [g("openra"), g("openttd")] });
  assert.deepEqual(
    games.map((e) => e.slug),
    ["openra", "openttd"]
  );
});

test("startup still enriches cached entries from the bundle", () => {
  const games = startupCatalog({
    cached: [g("openra")],
    bundled: [g("openra", { exeHint: "openra", coverImage: "/bundled.webp" })],
  });
  assert.equal(games[0].exeHint, "openra");
});

test("retired, archived, or unlisted editions are stripped from catalog games", () => {
  const staleWolf = g("wolfenstein-enemy-territory", {
    editions: [
      { slug: "et-legacy", name: "ET: Legacy" },
      { slug: "steam", name: "Steam Official" },
      { slug: "truecombat-elite", name: "TrueCombat: Elite" },
    ],
  });
  const staleGemini = g("privateer-gemini-gold", {
    editions: [
      { slug: "gemini-gold-1-03", name: "Privateer Gemini Gold (v1.03)" },
      { slug: "gemini-gold-unix", name: "Privateer Gemini Gold (Linux & macOS Native)" },
    ],
  });
  const gameWithArchived = g("some-game", {
    editions: [
      { slug: "active", name: "Active Edition", status: "active", visibility: "public" },
      { slug: "archived", name: "Archived Edition", status: "archived" },
      { slug: "unlisted", name: "Unlisted Edition", visibility: "unlisted" },
    ],
  });

  const startup = startupCatalog({
    cached: [staleWolf, staleGemini, gameWithArchived],
    bundled: [],
  });
  assert.deepEqual(
    startup.find((e) => e.slug === "wolfenstein-enemy-territory").editions.map((e) => e.slug),
    ["et-legacy", "truecombat-elite"],
    "steam edition must be stripped from wolfenstein"
  );
  assert.deepEqual(
    startup.find((e) => e.slug === "privateer-gemini-gold").editions.map((e) => e.slug),
    ["gemini-gold-1-03"],
    "gemini-gold-unix edition must be stripped from privateer-gemini-gold"
  );
  assert.deepEqual(
    startup.find((e) => e.slug === "some-game").editions.map((e) => e.slug),
    ["active"],
    "archived and unlisted editions must be stripped"
  );

  const { games } = reconcileCatalog({
    remote: [staleWolf, staleGemini, gameWithArchived],
    cached: [],
    bundled: [],
  });
  assert.deepEqual(
    games.find((e) => e.slug === "wolfenstein-enemy-territory").editions.map((e) => e.slug),
    ["et-legacy", "truecombat-elite"]
  );
  assert.deepEqual(
    games.find((e) => e.slug === "privateer-gemini-gold").editions.map((e) => e.slug),
    ["gemini-gold-1-03"]
  );
  assert.deepEqual(
    games.find((e) => e.slug === "some-game").editions.map((e) => e.slug),
    ["active"]
  );
});
