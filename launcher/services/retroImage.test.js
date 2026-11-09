const test = require("node:test");
const assert = require("node:assert/strict");
const { coreForExtension, isRetroImage } = require("./ManagedRetroArch");

test("Amiga floppies are RetroArch images played on PUAE", () => {
  assert.equal(coreForExtension(".adf"), "puae");
  assert.equal(isRetroImage("1942_release_v1.0.2.adf"), true);
  assert.equal(isRetroImage("C:/Games/x/Game.GBA"), true);
  // Archives are extracted, never launched as an image.
  assert.equal(isRetroImage("1942_hd_release_v1.0.2.lha"), false);
  assert.equal(isRetroImage("game.zip"), false);
});
