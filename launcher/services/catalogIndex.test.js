/**
 * The catalog slug index, and the invariant that keeps it honest.
 *
 * `catalog.find((e) => e.slug === slug)` was written out at thirty-six call
 * sites — on the install and play paths, and inside IPC handlers the renderer
 * calls per card — each one a linear scan to answer what a Map answers
 * outright. They now go through catalogEntry().
 *
 * An index is only safe while nothing can change the catalog behind its back,
 * so the structural tests here matter more than the lookup ones: `catalog` must
 * be assigned in exactly one place besides its declaration, and never mutated
 * in place. If either stops holding, the index silently serves stale games.
 *
 * Run: node services/catalogIndex.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

/** catalogEntry and setCatalog, lifted from main.js over a fake catalog. */
function loadIndex(initial) {
  const grab = (name) => {
    const start = MAIN.indexOf(`\nfunction ${name}(`);
    assert.notEqual(start, -1, `${name} not found — main.js has been restructured`);
    let i = MAIN.indexOf("{", start);
    let d = 0;
    for (; i < MAIN.length; i += 1) {
      if (MAIN[i] === "{") d += 1;
      else if (MAIN[i] === "}") {
        d -= 1;
        if (d === 0) break;
      }
    }
    return MAIN.slice(start, i + 1);
  };
  return new Function(
    "initial",
    `let catalog = initial; let catalogIndex = null;
     ${grab("setCatalog")} ${grab("catalogEntry")}
     return { catalogEntry, setCatalog, current: () => catalog };`
  )(initial);
}

const GAMES = [
  { slug: "morrowind", title: "Morrowind" },
  { slug: "ysoccer", title: "YSoccer" },
  { slug: "0ad", title: "0 A.D." },
];

test("finds what find() found", () => {
  const { catalogEntry } = loadIndex(GAMES);
  for (const g of GAMES) assert.equal(catalogEntry(g.slug), g);
});

test("an unknown slug is null, not undefined", () => {
  // Call sites do `catalogEntry(slug) || fallback` and `?.needsDosBox`, so the
  // miss has to be falsy — but null keeps it distinguishable from a bug.
  const { catalogEntry } = loadIndex(GAMES);
  assert.equal(catalogEntry("not-a-game"), null);
});

test("empty and missing slugs do not throw", () => {
  const { catalogEntry } = loadIndex(GAMES);
  for (const bad of ["", null, undefined, 0, false]) assert.equal(catalogEntry(bad), null);
});

test("a non-string slug is coerced the way find() compared", () => {
  const { catalogEntry } = loadIndex([{ slug: "123", title: "Numeric" }]);
  assert.equal(catalogEntry(123).title, "Numeric");
});

test("a replaced catalog is visible immediately", () => {
  // The whole risk of an index: setCatalog must drop it.
  const idx = loadIndex(GAMES);
  assert.equal(idx.catalogEntry("morrowind").title, "Morrowind");
  idx.setCatalog([{ slug: "morrowind", title: "Morrowind (updated)" }]);
  assert.equal(idx.catalogEntry("morrowind").title, "Morrowind (updated)");
});

test("a game removed by a refresh stops resolving", () => {
  const idx = loadIndex(GAMES);
  assert.ok(idx.catalogEntry("ysoccer"));
  idx.setCatalog(GAMES.filter((g) => g.slug !== "ysoccer"));
  assert.equal(idx.catalogEntry("ysoccer"), null);
});

test("the ensureCatalogEntry merge shape resolves to the merged game", () => {
  // catalog = [...catalog.filter(not this slug), merged]
  const idx = loadIndex(GAMES);
  const merged = { slug: "0ad", title: "0 A.D.", hostLaunch: { port: 20595 } };
  idx.setCatalog([...idx.current().filter((e) => e.slug !== "0ad"), merged]);
  assert.equal(idx.catalogEntry("0ad"), merged);
});

test("an empty or absent catalog is survivable", () => {
  assert.equal(loadIndex([]).catalogEntry("morrowind"), null);
  assert.equal(loadIndex(null).catalogEntry("morrowind"), null);
  assert.equal(loadIndex(undefined).catalogEntry("morrowind"), null);
});

test("entries without a slug are skipped rather than indexed", () => {
  const { catalogEntry } = loadIndex([null, {}, { slug: "" }, { slug: "ok", title: "Fine" }]);
  assert.equal(catalogEntry("ok").title, "Fine");
  assert.equal(catalogEntry(""), null);
});

/* --- the invariants that make an index safe at all --- */

test("no linear catalog scan is left in main.js", () => {
  assert.doesNotMatch(
    MAIN,
    /catalog\.find\(/,
    "a catalog.find() has come back — use catalogEntry(slug)"
  );
});

test("catalog is assigned only at its declaration and inside setCatalog", () => {
  const assignments = [...MAIN.matchAll(/(^|[^.\w])catalog\s*=[^=]/gm)];
  assert.equal(
    assignments.length,
    2,
    "catalog is assigned somewhere new — that assignment must go through setCatalog, " +
      "or the index will serve stale games"
  );
  assert.match(MAIN, /^let catalog = /m);
  assert.match(MAIN, /function setCatalog\(next\) \{\s*catalog = next;\s*catalogIndex = null;/);
});

test("catalog is never mutated in place", () => {
  // push/splice would change the array without ever assigning it, so the
  // index would never be dropped.
  assert.doesNotMatch(MAIN, /catalog\.(push|splice|pop|shift|unshift|sort|reverse)\(/);
  assert.doesNotMatch(MAIN, /\bcatalog\[[^\]]+\]\s*=/);
});
