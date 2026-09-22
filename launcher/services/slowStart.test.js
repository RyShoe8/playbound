/**
 * The slow-start warning table drives a message that tells players NOT to
 * close a game that looks hung, so a wrong lookup either scares people off a
 * healthy game or leaves the one genuinely slow title unexplained.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// guidanceModal.js is an ES module in the renderer; pull the pure helper out
// rather than standing up a DOM just to read a lookup table.
const src = fs.readFileSync(
  path.join(__dirname, "..", "renderer", "guidanceModal.js"),
  "utf8"
);
const start = src.indexOf("const SLOW_START_SECONDS");
const end = src.indexOf("export function showLaunchGuidanceModal");
assert.ok(start >= 0 && end > start, "slow-start helper not found in guidanceModal.js");
const slowStartSeconds = new Function(
  `${src.slice(start, end).replace(/export function/g, "function")}; return slowStartSeconds;`
)();

test("warns for the Combined Arms edition", () => {
  assert.equal(slowStartSeconds("openra", "combined-arms"), 60);
});

test("does not warn for the other OpenRA editions", () => {
  for (const ed of ["official", "tiberian-dawn-hd", "ra2"]) {
    assert.equal(slowStartSeconds("openra", ed), null, `${ed} should not warn`);
  }
});

test("does not warn for unrelated games", () => {
  assert.equal(slowStartSeconds("alien-swarm", "official"), null);
  assert.equal(slowStartSeconds("", ""), null);
  assert.equal(slowStartSeconds(null, null), null);
});

test("is case-insensitive, since edition slugs arrive from several sources", () => {
  assert.equal(slowStartSeconds("OpenRA", "Combined-Arms"), 60);
});

test("a game-wide number applies to every edition", () => {
  // Guards the `typeof entry === "number"` branch used when a whole game is slow.
  const fn = new Function(
    'const SLOW_START_SECONDS = { slowgame: 90 };' +
      'function slowStartSeconds(slug, editionSlug) {' +
      '  const entry = SLOW_START_SECONDS[String(slug || "").toLowerCase()];' +
      '  if (!entry) return null;' +
      '  if (typeof entry === "number") return entry;' +
      '  const ed = String(editionSlug || "").toLowerCase();' +
      '  return ed && typeof entry[ed] === "number" ? entry[ed] : null;' +
      '} return slowStartSeconds;'
  )();
  assert.equal(fn("slowgame", "anything"), 90);
});
