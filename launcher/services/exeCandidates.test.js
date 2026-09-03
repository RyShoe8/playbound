/**
 * Run: node services/exeCandidates.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const { chooseExeFromListing, isUninstallerExe } = require("./exeCandidates.js");

test("a recipe's own name wins over everything else", () => {
  const files = ["7kaa.exe", "bin/game.exe", "unins000.exe"];
  assert.equal(
    chooseExeFromListing({ files, wanted: ["bin/game.exe"], title: "Seven Kingdoms" }),
    "bin/game.exe"
  );
});

test("an uninstaller is never the game", () => {
  /*
   * Inno Setup writes DisplayIcon pointing at its own uninstaller as often as
   * at the app, and a Play button wired to unins000.exe offers to delete the
   * game the player just installed.
   */
  assert.ok(isUninstallerExe("C:\\Games\\7KAA\\unins000.exe"));
  assert.ok(isUninstallerExe("uninstall.exe"));
  assert.ok(isUninstallerExe("Uninstall Seven Kingdoms.exe"));
  assert.ok(!isUninstallerExe("7kaa.exe"));
  assert.equal(
    chooseExeFromListing({ files: ["unins000.exe", "7kaa.exe"], title: "Seven Kingdoms: Ancient Adversaries" }),
    "7kaa.exe"
  );
});

test("a game with no recipe hints is found by resembling its own name", () => {
  const files = ["unins000.exe", "vcredist_x86.exe", "7kaa.exe", "tools/editor.exe"];
  assert.equal(
    chooseExeFromListing({
      files,
      title: "Seven Kingdoms: Ancient Adversaries",
      slug: "seven-kingdoms-ancient-adversaries",
    }),
    null,
    "7kaa does not resemble the title, and the folder has more than one candidate"
  );
  assert.equal(
    chooseExeFromListing({ files: ["unins000.exe", "7kaa.exe"], slug: "7kaa" }),
    "7kaa.exe"
  );
});

test("one obvious executable is taken; a folder full of them is not", () => {
  assert.equal(
    chooseExeFromListing({ files: ["unins000.exe", "game.exe"], title: "Something Else" }),
    "game.exe"
  );
  assert.equal(
    chooseExeFromListing({ files: ["a.exe", "b.exe", "c.exe"], title: "Something Else" }),
    null
  );
});

test("shallower wins when several names resemble the title", () => {
  const files = ["bin/openra.exe", "OpenRA.exe"];
  assert.equal(chooseExeFromListing({ files, title: "OpenRA" }), "OpenRA.exe");
});

test("a folder with nothing runnable resolves to nothing", () => {
  assert.equal(chooseExeFromListing({ files: ["readme.txt", "unins000.exe"] }), null);
  assert.equal(chooseExeFromListing({}), null);
});
