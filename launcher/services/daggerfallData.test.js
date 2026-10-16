"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { explode, unpackPackedDat, missingArena2, installFreewareArena2, REQUIRED_ARENA2 } = require("./daggerfallData");

// Test vector from blast.c: a DCL stream that expands to a repeating pattern.
assert.equal(explode(Buffer.from("00048224258f807f", "hex"), 0).out.toString(), "AIAIAIAIAIAIA");

// Not a DCL stream, and not a PACKED.DAT.
assert.throws(() => explode(Buffer.from("0907", "hex"), 0), /not a DCL stream/);
assert.throws(() => unpackPackedDat(Buffer.alloc(10)), /too short/);

// missingArena2 reports what a folder lacks, whatever the case on disk.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-df-test-"));
try {
  assert.deepEqual(missingArena2(fs, tmp), REQUIRED_ARENA2);
  for (const name of ["arch3d.bsa", "BLOCKS.BSA", "maps.bsa"]) fs.writeFileSync(path.join(tmp, name), "x");
  assert.deepEqual(missingArena2(fs, tmp), ["MONSTER.BSA", "WOODS.WLD", "TEXT.RSC", "ART_PAL.COL"]);
  assert.equal(missingArena2(fs, path.join(tmp, "nope")), null);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Against the real Bethesda download, when it has been unpacked locally. Skipped otherwise.
const REAL = process.env.DAGGERFALL_PACKED_DAT || "D:/Playbound/modwork/df/x/DFCD/DAGGER/ARENA2/PACKED.DAT";
if (fs.existsSync(REAL)) {
  const files = unpackPackedDat(fs.readFileSync(REAL));
  assert.deepEqual(files.map((f) => [f.name, f.data.length]), [["ARCH3D.BSA", 27143532], ["DAGGER.SND", 7661766]]);
  // Both are number-indexed BSA archives with a record count in the header.
  assert.equal(files[0].data.readUInt16LE(0), 10251);
  assert.equal(files[1].data.readUInt16LE(0), 459);
  assert.equal(files[0].data.readUInt16LE(2), 0x200);
}

(async () => {
  // The installer, driven by fake download/extract so no network is touched.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "pb-df-install-"));
  try {
    const dest = path.join(work, "ARENA2");
    await assert.rejects(
      installFreewareArena2(dest, {
        fs,
        path,
        tmpdir: work,
        download: async (_url, to) => fs.writeFileSync(to, "zip"),
        extractArchive: async (_zip, to) => fs.mkdirSync(to, { recursive: true }),
      }),
      /expected ARENA2 folder/
    );
    assert.equal(fs.readdirSync(work).filter((n) => n.startsWith("pb-daggerfall-")).length, 0, "temp work is cleaned up");
    console.log("daggerfallData tests passed");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
})();
