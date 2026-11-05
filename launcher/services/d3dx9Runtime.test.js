"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const d = require("./d3dx9Runtime");

const env = { WINDIR: "C:\\Windows" };

test("only a listed game on Windows without the DLL needs it", () => {
  const none = { platform: "win32", env, exists: () => false };
  assert.equal(d.needsD3dx9("boll-deluxe", "D:\\Games\\boll", none), true);
  assert.equal(d.needsD3dx9("openra", "D:\\Games\\openra", none), false);
  assert.equal(d.needsD3dx9("boll-deluxe", "/games/boll", { ...none, platform: "linux" }), false);
  assert.equal(d.needsD3dx9("boll-deluxe", "D:\\Games\\boll", { platform: "win32", env, exists: (p) => p.includes("SysWOW64") }), false);
  assert.equal(d.needsD3dx9("boll-deluxe", "D:\\Games\\boll", { platform: "win32", env, exists: (p) => p.startsWith("D:") }), false);
});

test("refuses a package that does not match the pinned hash, leaving the game folder alone", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "d3dx-"));
  const game = path.join(root, "game");
  fs.mkdirSync(game);
  let extracted = false;
  await assert.rejects(
    d.installD3dx9(game, {
      workDir: path.join(root, "work"),
      download: async (_url, dest) => fs.writeFileSync(dest, "not the package"),
      extract: async () => { extracted = true; },
    }),
    /checksum mismatch/
  );
  assert.equal(extracted, false);
  assert.deepEqual(fs.readdirSync(game), []);
  fs.rmSync(root, { recursive: true });
});
