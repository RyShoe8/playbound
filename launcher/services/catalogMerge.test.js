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

/* --- a cache written before reconcileCatalog cannot decide membership --- */

test("an untrusted cache fills in fields but adds no games", () => {
  /*
   * Version 1 caches were written by the union logic reconcileCatalog
   * replaced, so they only ever grew. A real one holds 159 games where the
   * feed serves 92 — and each of the 67 extras fails its detail and hardware
   * lookups with "Game not found" in the launcher while the site is fine.
   */
  const bundled = [
    { slug: "0ad", title: "0 A.D.", blurb: "stale blurb" },
    { slug: "freedoom", title: "Freedoom" },
  ];
  const cached = [
    { slug: "0ad", title: "0 A.D.", blurb: "fresher blurb" },
    { slug: "freedoom", title: "Freedoom" },
    { slug: "unpublished-game", title: "Gone" },
  ];

  const out = startupCatalog({ cached, bundled, cachedIsTrusted: false });
  assert.deepStrictEqual(out.map((g) => g.slug).sort(), ["0ad", "freedoom"]);
  assert.strictEqual(
    out.find((g) => g.slug === "0ad").blurb,
    "fresher blurb",
    "the cache is still the freshest field data"
  );
});

test("a trusted cache still decides membership", () => {
  // The designed behaviour: a reconciled cache is closer to the feed than the
  // build's own copy, so a game added since the build still appears offline.
  const bundled = [{ slug: "0ad", title: "0 A.D." }];
  const cached = [
    { slug: "0ad", title: "0 A.D." },
    { slug: "added-since-build", title: "New" },
  ];
  const out = startupCatalog({ cached, bundled, cachedIsTrusted: true });
  assert.deepStrictEqual(out.map((g) => g.slug).sort(), ["0ad", "added-since-build"]);
});

test("trust defaults to true so existing callers are unchanged", () => {
  const bundled = [{ slug: "a", title: "A" }];
  const cached = [{ slug: "a", title: "A" }, { slug: "b", title: "B" }];
  assert.strictEqual(startupCatalog({ cached, bundled }).length, 2);
});

test("an untrusted empty cache still falls back to bundled", () => {
  const bundled = [{ slug: "a", title: "A" }];
  assert.deepStrictEqual(
    startupCatalog({ cached: [], bundled, cachedIsTrusted: false }).map((g) => g.slug),
    ["a"]
  );
  assert.deepStrictEqual(
    startupCatalog({ cached: null, bundled, cachedIsTrusted: false }).map((g) => g.slug),
    ["a"]
  );
});

test("one refresh clears the problem for good", () => {
  // reconcileCatalog's output becomes the next cache, and that one is trusted.
  const bundled = [{ slug: "0ad", title: "0 A.D." }];
  const stale = [{ slug: "0ad", title: "0 A.D." }, { slug: "gone", title: "Gone" }];
  const remote = [{ slug: "0ad", title: "0 A.D." }, { slug: "new-game", title: "New" }];

  const { games, removed } = reconcileCatalog({ remote, cached: stale, bundled });
  assert.deepStrictEqual(games.map((g) => g.slug).sort(), ["0ad", "new-game"]);
  assert.ok(removed.includes("gone"), "the stale slug is reported removed");

  const after = startupCatalog({ cached: games, bundled, cachedIsTrusted: true });
  assert.deepStrictEqual(after.map((g) => g.slug).sort(), ["0ad", "new-game"]);
});
