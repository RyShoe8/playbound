"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { prepareLaunch, hasLaunchFix } = require("./index");

function settingsStore(initial = {}) {
  let settings = initial;
  return { loadSettings: () => settings, saveSettings: (next) => (settings = next), get: () => settings };
}

test("registry covers the moved games and nothing else claims them twice", () => {
  for (const slug of ["streets-of-rage-remake", "x-men-arcade-remake", "tmnt-rescue-palooza"]) {
    assert.ok(hasLaunchFix(slug), slug);
  }
  assert.equal(hasLaunchFix("not-a-game"), false);
});

test("a game without a fix gets no env", async () => {
  assert.equal(await prepareLaunch("not-a-game", {}), null);
});

test("SoR: seeds the bundled save only when none exists", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sor-"));
  const exe = path.join(dir, "SorR.exe");
  const res = fs.mkdtempSync(path.join(os.tmpdir(), "res-"));
  fs.mkdirSync(path.join(res, "game-defaults", "streets-of-rage-remake"), { recursive: true });
  fs.writeFileSync(path.join(res, "game-defaults", "streets-of-rage-remake", "savegame.sor"), "template");
  const ctx = { info: { exe, dir }, platform: "win32", resourceRoots: [res], ...settingsStore() };
  await prepareLaunch("streets-of-rage-remake", ctx);
  const target = path.join(dir, "savegame", "savegame.sor");
  assert.equal(fs.readFileSync(target, "utf8"), "template");
  fs.writeFileSync(target, "mine");
  await prepareLaunch("streets-of-rage-remake", ctx);
  assert.equal(fs.readFileSync(target, "utf8"), "mine", "an existing save is never touched");
});

test("TMNT: DPI-aware env on Windows even with no config to edit", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tmnt-"));
  const env = await prepareLaunch("tmnt-rescue-palooza", {
    info: { dir, exe: path.join(dir, "TMNT_Rescue_Palooza.exe") },
    platform: "win32",
    resourceRoots: [],
    ...settingsStore(),
  });
  assert.deepEqual(env, { __COMPAT_LAYER: "HighDpiAware" });
});

test("X-Men: first launch binds P1, applies fullscreen once, and is marked done", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xmen-"));
  fs.mkdirSync(path.join(dir, "Saves"));
  const cfg = Buffer.alloc(352, 0);
  cfg.writeUInt32LE(0x00033748, 0);
  for (let i = 0; i < 12; i += 1) cfg.writeInt32LE(-999, 0x34 + i * 4);
  const cfgPath = path.join(dir, "Saves", "XMEN_Arcade.cfg");
  fs.writeFileSync(cfgPath, cfg);
  const store = settingsStore();
  await prepareLaunch("x-men-arcade-remake", { info: { exe: path.join(dir, "GAMEnew.exe"), dir }, platform: "win32", resourceRoots: [], ...store });
  const out = fs.readFileSync(cfgPath);
  assert.equal(out.readInt32LE(0x34), 618, "P1 bound");
  assert.equal(out.readInt32LE(352 - 28), 1, "fullscreen");
  assert.equal(store.get().openborFullscreenApplied["x-men-arcade-remake"], true);
});
