"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveLaunch } = require("./index");

test("Arena repairs an older install pointing at ARENA.BAT", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-arena-launch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gameDir = path.join(root, "ARENA");
  fs.mkdirSync(gameDir);
  const dosExe = path.join(gameDir, "A.EXE");
  const bat = path.join(gameDir, "ARENA.BAT");
  fs.writeFileSync(dosExe, "MZ");
  fs.writeFileSync(bat, "A.EXE\r\n");
  const repairs = [];
  const result = resolveLaunch("tes-arena", {
    launchPath: bat, info: { dir: root, exe: bat }, edSlug: "official", args: [], join: null,
  }, { persistEditionExe: (...args) => repairs.push(args) });
  assert.equal(result.launchPath, dosExe);
  assert.equal(result.info.exe, dosExe);
  assert.deepEqual(repairs, [["tes-arena", "official", bat, dosExe]]);
});

test("Arena reports missing game files instead of launching a Windows batch script", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-arena-missing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => resolveLaunch("tes-arena", {
    launchPath: path.join(root, "ARENA.BAT"), info: { dir: root }, edSlug: "official", args: [], join: null,
  }, { persistEditionExe: () => { throw new Error("unexpected repair"); } }),
  { code: "ARENA_FILES_MISSING" });
});

test("OpenTESArena keeps its own engine executable", () => {
  const state = { launchPath: "C:\\Games\\otesa.exe", info: { dir: "C:\\Games" }, edSlug: "opentesarena", args: [], join: null };
  assert.deepEqual(resolveLaunch("tes-arena", state, {}), { ...state, slug: "tes-arena" });
});
