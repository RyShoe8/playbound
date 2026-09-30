"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chooseOutrunResolutionIndex, patchOutrunSettingsText, ensureOutrunWindowSize } = require("./outrunDisplay");

const SETTINGS = ["DIFFICULTY: NORMAL", "TRAFFIC: MEDIUM", "VOLUME_SOUNDTRACKS: 100", "FULL_SCREEN: DISABLED", "RESOLUTION: 0", "CONTROL_LEFT: LEFT CURSOR", ""].join("\r\n");

test("picks the largest window that fits the screen", () => {
  assert.equal(chooseOutrunResolutionIndex({ width: 1920, height: 1040 }), 3); // 1366x768
  assert.equal(chooseOutrunResolutionIndex({ width: 1366, height: 728 }), 0); // 768-tall sizes do not fit
  assert.equal(chooseOutrunResolutionIndex({ width: 1280, height: 800 }), 0); // 760px of usable height: 768-tall sizes do not fit
  assert.equal(chooseOutrunResolutionIndex({ width: 1280, height: 830 }), 1); // 1024x768 fits
  assert.equal(chooseOutrunResolutionIndex({ width: 800, height: 600 }), 0); // nothing fits: smallest
});

test("only the RESOLUTION line changes, and line endings are kept", () => {
  const out = patchOutrunSettingsText(SETTINGS, 3);
  assert.equal(out, SETTINGS.replace("RESOLUTION: 0", "RESOLUTION: 3"));
  assert.ok(out.includes("\r\n") && !/[^\r]\n/.test(out));
});

test("a player's own FULLSCREEN choice and an already-correct value are left alone", () => {
  assert.equal(patchOutrunSettingsText(SETTINGS.replace("RESOLUTION: 0", "RESOLUTION: 4"), 3), null);
  assert.equal(patchOutrunSettingsText(SETTINGS.replace("RESOLUTION: 0", "RESOLUTION: 3"), 3), null);
});

test("a settings file without a RESOLUTION line gets one appended", () => {
  assert.equal(patchOutrunSettingsText("DIFFICULTY: EASY\n", 2), "DIFFICULTY: EASY\nRESOLUTION: 2\n");
});

test("edits an existing Settings.txt on disk and never creates one", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "outrun-"));
  const workArea = { width: 1920, height: 1040 };
  assert.deepEqual((await ensureOutrunWindowSize({ dirs: [root], workArea })).reason, "settings_not_found");
  assert.ok(!fs.existsSync(path.join(root, "Resources")));

  const dir = path.join(root, "OutRun-5.0", "Resources", "Settings");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "Settings.txt"), SETTINGS);
  const result = await ensureOutrunWindowSize({ dirs: [root], workArea });
  assert.equal(result.changed, true);
  assert.match(fs.readFileSync(path.join(dir, "Settings.txt"), "utf8"), /RESOLUTION: 3/);
  assert.equal((await ensureOutrunWindowSize({ dirs: [root], workArea })).reason, "already_set");
});
