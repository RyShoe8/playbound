/**
 * Dune Legacy's missing-data guard.
 *
 * The check sat in main.js and so could only be exercised by launching the
 * app and picking the one game it applies to. It gates a user-visible error
 * (DUNE_LEGACY_MISSING_PAK) that fires instead of Play, so getting it wrong in
 * either direction is bad: too strict blocks a working install, too loose
 * hands the player a window that opens and closes.
 *
 * Run: node services/duneLegacyData.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { duneLegacyHasPakData, pakSearchRoots } = require("./duneLegacyData");

/** A throwaway install directory; returns its path. */
function tempInstall(files = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dune-"));
  for (const rel of files) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "");
  }
  return dir;
}

const cleanup = [];
test.after(async () => {
  for (const dir of cleanup) await fsp.rm(dir, { recursive: true, force: true });
});
function install(files) {
  const dir = tempInstall(files);
  cleanup.push(dir);
  return dir;
}

test("either PAK counts — the game needs one, not both", () => {
  assert.equal(duneLegacyHasPakData(null, install(["DUNE.PAK"])), true);
  assert.equal(duneLegacyHasPakData(null, install(["ATRE.PAK"])), true);
  assert.equal(duneLegacyHasPakData(null, install(["DUNE.PAK", "ATRE.PAK"])), true);
});

test("an install with no data is reported missing", () => {
  assert.equal(duneLegacyHasPakData(null, install(["dunelegacy.exe"])), false);
});

test("the data/ subdirectory is searched, since that is where it usually lands", () => {
  assert.equal(duneLegacyHasPakData(null, install(["data/DUNE.PAK"])), true);
});

test("a PAK beside the exe is found when only the exe path is known", () => {
  const dir = install(["dunelegacy.exe", "DUNE.PAK"]);
  assert.equal(duneLegacyHasPakData(path.join(dir, "dunelegacy.exe"), null), true);
});

test("dir wins over exe when both are given", () => {
  // The install record carries both; dir is the authoritative one.
  const withData = install(["DUNE.PAK"]);
  const without = install(["dunelegacy.exe"]);
  assert.equal(duneLegacyHasPakData(path.join(without, "dunelegacy.exe"), withData), true);
});

test("nothing to go on is a clean false, not a throw", () => {
  const appdata = process.env.APPDATA;
  delete process.env.APPDATA;
  try {
    assert.equal(duneLegacyHasPakData(null, null), false);
    assert.equal(duneLegacyHasPakData(undefined, undefined), false);
  } finally {
    if (appdata !== undefined) process.env.APPDATA = appdata;
  }
});

test("a nonexistent directory is false rather than an error", () => {
  assert.equal(duneLegacyHasPakData(null, path.join(os.tmpdir(), "definitely-not-here-9f3a")), false);
});

test("the roaming profile copy is searched too", () => {
  /*
   * Dune Legacy reads user data out of APPDATA\\dunelegacy\\data, so a player
   * who put the PAKs there has a working install even with an empty game dir.
   */
  const appdata = process.env.APPDATA;
  const fake = install(["dunelegacy/data/DUNE.PAK"]);
  process.env.APPDATA = fake;
  try {
    assert.equal(duneLegacyHasPakData(null, install(["dunelegacy.exe"])), true);
  } finally {
    if (appdata === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = appdata;
  }
});

test("search order is install dir, then data/, then the roaming profile", () => {
  const appdata = process.env.APPDATA;
  process.env.APPDATA = path.join("C:", "Users", "x", "AppData", "Roaming");
  try {
    const roots = pakSearchRoots(null, path.join("D:", "Games", "dune"));
    assert.equal(roots.length, 3);
    assert.equal(roots[0], path.join("D:", "Games", "dune"));
    assert.equal(roots[1], path.join("D:", "Games", "dune", "data"));
    assert.match(roots[2], /dunelegacy/);
  } finally {
    if (appdata === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = appdata;
  }
});

test("a different .PAK is not mistaken for the game data", () => {
  assert.equal(duneLegacyHasPakData(null, install(["SOMETHING.PAK"])), false);
});
