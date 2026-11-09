"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { hasManifest, carryPlayerFiles, mergeModFiles, modUpdateAction, shouldUpdateEdition, writeManifest } = require("./autoUpdate");

test("editions update once per new, comparable release", () => {
  assert.equal(shouldUpdateEdition({ fromVersion: "v0.5.5", toVersion: "0.5.7" }), true);
  assert.equal(shouldUpdateEdition({ fromVersion: "0.5.7", toVersion: "v0.5.7" }), false);
  assert.equal(shouldUpdateEdition({ fromVersion: "1.0", toVersion: "Latest release" }), false);
  assert.equal(shouldUpdateEdition({ fromVersion: "", toVersion: "1.0" }), false);
  assert.equal(shouldUpdateEdition({ fromVersion: "1.0", toVersion: "1.1", triedVersion: "v1.1" }), false);
});

test("mods compare tags, or remember a first value they cannot compare", () => {
  const github = { downloadKind: "github-zip", latestVersion: "v2" };
  assert.equal(modUpdateAction({ ...github, record: { version: "v1" } }), "update");
  assert.equal(modUpdateAction({ ...github, record: { version: "v2" } }), "none");
  assert.equal(modUpdateAction({ ...github, record: { version: "v1", autoUpdateTriedTo: "v2" } }), "none");
  const direct = { downloadKind: "direct-zip", latestVersion: "etag-b" };
  assert.equal(modUpdateAction({ ...direct, record: { version: "file.zip" } }), "remember");
  assert.equal(modUpdateAction({ ...direct, record: { latestSeen: "etag-b" } }), "none");
  assert.equal(modUpdateAction({ ...direct, record: { latestSeen: "etag-a" } }), "update");
  assert.equal(modUpdateAction({ downloadKind: "external", latestVersion: "1", record: {} }), "none");
  assert.equal(modUpdateAction({ ...github, record: { version: "v1", installerManagedExternally: true } }), "none");
  assert.equal(modUpdateAction({ downloadKind: "github-zip", latestVersion: null, record: { version: "v1" } }), "none");
});

test("an update keeps saves and edited settings but takes the new program files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-carry-"));
  const oldDir = path.join(root, "old");
  const newDir = path.join(root, "new");
  const write = (dir, rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  write(oldDir, "saves/slot1.sav", "progress");
  write(oldDir, "config.ini", "edited");
  write(oldDir, "defaults.dat", "old default");
  write(oldDir, "game.exe", "old exe");
  write(newDir, "config.ini", "shipped");
  write(newDir, "defaults.dat", "new default");
  write(newDir, "game.exe", "new exe");

  const now = Date.now();
  const installedAt = now - 60 * 60 * 1000;
  const longAgo = new Date(installedAt - 1000);
  fs.utimesSync(path.join(oldDir, "defaults.dat"), longAgo, longAgo);

  carryPlayerFiles(oldDir, newDir, installedAt);
  const read = (rel) => fs.readFileSync(path.join(newDir, rel), "utf8");
  assert.equal(read("saves/slot1.sav"), "progress");
  assert.equal(read("config.ini"), "edited");
  assert.equal(read("defaults.dat"), "new default");
  assert.equal(read("game.exe"), "new exe");
  fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-update-"));
  const write = (rel, text, ageMs = 0) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
    if (ageMs) {
      const when = new Date(Date.now() - ageMs);
      fs.utimesSync(full, when, when);
    }
  };
  return { root, write, read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"), has: (rel) => fs.existsSync(path.join(root, rel)) };
}

test("v1 to v2 with a manifest: removed files go, player files stay, code is new", () => {
  const { root, write, read, has } = fixture();
  const HOUR = 60 * 60 * 1000;
  for (const [rel, text] of [["game.exe", "v1"], ["data/defaults.dat", "v1"], ["data/dropped.dat", "v1"], ["config.ini", "shipped"], ["engine.dll", "v1"]]) {
    write(`old/${rel}`, text, HOUR);
  }
  writeManifest(path.join(root, "old"));
  write("old/saves/slot1.sav", "progress");
  write("old/config.ini", "player edit");
  write("old/engine.dll", "tampered");
  for (const [rel, text] of [["game.exe", "v2"], ["data/defaults.dat", "v2"], ["config.ini", "shipped v2"], ["engine.dll", "v2"]]) {
    write(`new/${rel}`, text);
  }
  writeManifest(path.join(root, "new"));

  carryPlayerFiles(path.join(root, "old"), path.join(root, "new"), NaN);
  assert.equal(read("new/saves/slot1.sav"), "progress");
  assert.equal(read("new/config.ini"), "player edit");
  assert.equal(read("new/game.exe"), "v2");
  assert.equal(read("new/engine.dll"), "v2");
  assert.equal(read("new/data/defaults.dat"), "v2");
  assert.equal(has("new/data/dropped.dat"), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a mod update keeps edits and removes what the release dropped", () => {
  const { root, write, read, has } = fixture();
  const target = path.join(root, "target");
  write("target/game-file.dat", "not the mod's");
  write("v1/mod/settings.cfg", "default");
  write("v1/mod/old.dat", "v1");
  write("v1/mod/main.dat", "v1");
  const stamps = mergeModFiles(path.join(root, "v1"), target, null);
  const later = new Date(Date.now() + 60 * 1000);
  fs.writeFileSync(path.join(target, "mod/settings.cfg"), "player edit");
  fs.utimesSync(path.join(target, "mod/settings.cfg"), later, later);
  write("v2/mod/settings.cfg", "new default");
  write("v2/mod/main.dat", "v2");
  mergeModFiles(path.join(root, "v2"), target, stamps);
  assert.equal(read("target/mod/settings.cfg"), "player edit");
  assert.equal(read("target/mod/main.dat"), "v2");
  assert.equal(has("target/mod/old.dat"), false);
  assert.equal(read("target/game-file.dat"), "not the mod's");
  fs.rmSync(root, { recursive: true, force: true });
});

test("an install is only exact once it has a file record", () => {
  const { root, write } = fixture();
  write("game.exe", "v1");
  assert.equal(hasManifest(root), false);
  writeManifest(root);
  assert.equal(hasManifest(root), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("auto-update never goes backwards, and orders only plain versions", () => {
  const { compareVersions } = require("./autoUpdate");
  // HyperDisc Arena: a stale 0.2.0 label must not reinstall over v0.2.12.
  assert.equal(shouldUpdateEdition({ fromVersion: "v0.2.12", toVersion: "0.2.0" }), false);
  assert.equal(shouldUpdateEdition({ fromVersion: "v0.2.0", toVersion: "0.2.12" }), true);
  assert.equal(compareVersions("v0.2.12", "0.2.0"), 1);
  assert.equal(compareVersions("1.5", "1.5.0"), 0);
  // Unorderable labels still update on change, as before.
  assert.equal(compareVersions("release-20250330", "1.5"), null);
  assert.equal(shouldUpdateEdition({ fromVersion: "release-20240101", toVersion: "release-20250330" }), true);
});
