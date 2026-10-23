const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { needsBaseFiles, editionTitle, baseFilesPresent, findCompleteArena2 } = require("./daggerfallBaseFirst");

// Same contract as daggerfallData.missingArena2: [] when complete, a list of absent files otherwise.
const REQUIRED = ["ARCH3D.BSA", "DAGGER.SND"];
const missingArena2 = (fsModule, dir) => {
  const names = new Set(fsModule.readdirSync(dir).map((n) => n.toUpperCase()));
  return REQUIRED.filter((n) => !names.has(n));
};

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dfbase-"));
  for (const file of files) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x");
  }
  return root;
}

test("only the engines that bring no game files need the base game", () => {
  assert.equal(needsBaseFiles("daggerfall", "daggerfall-online"), true);
  assert.equal(needsBaseFiles("daggerfall", "daggerfall-unity"), true);
  assert.equal(needsBaseFiles("daggerfall", "classic-dos"), false);
  assert.equal(needsBaseFiles("daggerfall", null), false);
  assert.equal(needsBaseFiles("morrowind", "daggerfall-online"), false);
  assert.equal(editionTitle("daggerfall-online"), "Daggerfall Online");
});

test("finds a complete ARENA2 however the copy is nested or capitalised", () => {
  const nested = tree(["DFCD/DAGGER/ARENA2/ARCH3D.BSA", "DFCD/DAGGER/ARENA2/dagger.snd"]);
  assert.ok(findCompleteArena2(fs, path, nested, missingArena2));
  assert.equal(baseFilesPresent({ fs, path, roots: [nested], missingArena2 }), true);
});

test("an incomplete or missing copy does not count as the base game being present", () => {
  const partial = tree(["ARENA2/ARCH3D.BSA"]);
  const empty = tree(["readme.txt"]);
  assert.equal(baseFilesPresent({ fs, path, roots: [partial, empty, "/does/not/exist", null], missingArena2 }), false);
  assert.equal(baseFilesPresent({ fs, path, roots: [partial], missingArena2: () => [] }), false);
  assert.equal(baseFilesPresent({ fs, path, roots: [], missingArena2 }), false);
});
