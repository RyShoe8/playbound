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

test("display-prep games are registered", () => {
  for (const slug of ["outrun", "holocure", "renegade-x", "openciv3", "unknown-horizons"]) {
    assert.ok(hasLaunchFix(slug), slug);
  }
});

const { resolveLaunch, hasLaunchResolver } = require("./index");

function helpers(found = {}) {
  const persisted = [];
  return {
    persisted,
    findNamedPortableExe: (_dir, name) => found[name] || null,
    findExecutable: () => null,
    persistEditionExe: (...a) => persisted.push(a),
    firstRunnableOnPlatform: (list) => list.find(Boolean) || null,
    ensureUnixExecutable: (p) => p,
  };
}

test("resolvers: unknown slug passes state through untouched", () => {
  const state = { launchPath: "a.exe", args: ["-x"], info: {}, edSlug: "official", join: null };
  assert.equal(resolveLaunch("not-a-game", state, helpers()), state);
});

test("Xonotic: starter exe is swapped for the engine binary and persisted", () => {
  const h = helpers({ "xonotic-x86_64-sdl.exe": "C:/x/xonotic-x86_64-sdl.exe" });
  const out = resolveLaunch("xonotic", { launchPath: "C:/x/xonotic.exe", args: [], info: { dir: "C:/x" }, edSlug: "official", join: null }, h);
  assert.equal(out.launchPath, "C:/x/xonotic-x86_64-sdl.exe");
  assert.equal(out.info.exe, "C:/x/xonotic-x86_64-sdl.exe");
  assert.equal(h.persisted.length, 1);
});

test("Freedoom: launches Zandronum with the edition's IWAD", () => {
  const h = helpers({ "zandronum.exe": "C:/f/zandronum.exe" });
  const out = resolveLaunch("freedoom", { launchPath: "C:/f/gzdoom.exe", args: [], info: { dir: "C:/f" }, edSlug: "phase-1", join: null }, h);
  assert.equal(out.launchPath, "C:/f/zandronum.exe");
  assert.deepEqual(out.args.slice(0, 2), ["-iwad", "freedoom1.wad"]);
});

test("Unvanquished: updater with no engine found gets -connect for a join", () => {
  const out = resolveLaunch(
    "unvanquished",
    { launchPath: "C:/u/updater.exe", args: ["+connect", "1.2.3.4:27960"], info: { dir: null }, edSlug: "official", join: { host: "1.2.3.4", port: 27960 } },
    helpers()
  );
  assert.deepEqual(out.args, ["-connect", "1.2.3.4:27960"]);
});

test("a throwing resolver keeps the original launch", () => {
  const state = { launchPath: "C:/x/xonotic.exe", args: [], info: { dir: "C:/x" }, edSlug: "official", join: null };
  const h = { ...helpers(), findNamedPortableExe: () => { throw new Error("boom"); } };
  assert.equal(resolveLaunch("xonotic", state, h), state);
  assert.ok(hasLaunchResolver("zandronum"));
});
