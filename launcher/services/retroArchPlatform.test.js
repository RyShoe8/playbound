/**
 * Which RetroArch build and cores each platform gets.
 *
 * Every URL here was hardcoded to windows/x86_64 with a .dll core suffix, and
 * nothing checked process.platform — so a Mac or Linux player was handed a
 * Windows emulator and Windows cores, silently. mrboom's RetroArch edition and
 * every ROM install route through this.
 *
 * The paths asserted below were each checked against buildbot.libretro.com and
 * returned 200 before this landed.
 *
 * Run: node services/retroArchPlatform.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const {
  CORES,
  coreBinary,
  coreForExtension,
  coreUrl,
  retroArchUrl,
  retroPlatform,
  runtimeBinaryCandidates,
} = require("./ManagedRetroArch");

test("each platform maps to its own libretro build path and core suffix", () => {
  assert.deepEqual(retroPlatform("win32"), { path: "windows/x86_64", coreExt: "dll" });
  assert.deepEqual(retroPlatform("linux"), { path: "linux/x86_64", coreExt: "so" });
  assert.deepEqual(retroPlatform("darwin"), { path: "apple/osx/x86_64", coreExt: "dylib" });
});

test("RetroArch itself resolves per platform, and macOS gets the disk image", () => {
  assert.equal(
    retroArchUrl("win32"),
    "https://buildbot.libretro.com/stable/1.19.1/windows/x86_64/RetroArch.7z"
  );
  assert.equal(
    retroArchUrl("linux"),
    "https://buildbot.libretro.com/stable/1.19.1/linux/x86_64/RetroArch.7z"
  );
  // Verified: the apple path serves a .dmg, not a .7z.
  assert.equal(
    retroArchUrl("darwin"),
    "https://buildbot.libretro.com/stable/1.19.1/apple/osx/x86_64/RetroArch.dmg"
  );
});

test("cores resolve with the right extension for the host", () => {
  assert.equal(
    coreUrl("mrboom", "win32"),
    "https://buildbot.libretro.com/nightly/windows/x86_64/latest/mrboom_libretro.dll.zip"
  );
  assert.equal(
    coreUrl("mrboom", "linux"),
    "https://buildbot.libretro.com/nightly/linux/x86_64/latest/mrboom_libretro.so.zip"
  );
  assert.equal(
    coreUrl("mrboom", "darwin"),
    "https://buildbot.libretro.com/nightly/apple/osx/x86_64/latest/mrboom_libretro.dylib.zip"
  );
});

test("every supported core resolves on every platform", () => {
  for (const core of CORES) {
    for (const platform of ["win32", "linux", "darwin"]) {
      const url = coreUrl(core, platform);
      assert.ok(url, `${core} has no URL on ${platform}`);
      assert.match(url, /^https:\/\/buildbot\.libretro\.com\/nightly\//);
    }
  }
});

test("an unknown core resolves to nothing rather than a broken URL", () => {
  assert.equal(coreUrl("not-a-core", "linux"), null);
  assert.equal(coreBinary("/tmp/ra", "not-a-core", "linux"), null);
});

test("the installed core filename matches the platform's library suffix", () => {
  assert.match(coreBinary("/tmp/ra", "gambatte", "win32"), /gambatte_libretro\.dll$/);
  assert.match(coreBinary("/tmp/ra", "gambatte", "linux"), /gambatte_libretro\.so$/);
  assert.match(coreBinary("/tmp/ra", "gambatte", "darwin"), /gambatte_libretro\.dylib$/);
});

test("the executable is looked for where each platform's package puts it", () => {
  const mac = runtimeBinaryCandidates(path.join("/tmp/ra", "current"), "darwin");
  assert.ok(mac.some((c) => c.includes(path.join("RetroArch.app", "Contents", "MacOS"))));

  const win = runtimeBinaryCandidates(path.join("/tmp/ra", "current"), "win32");
  assert.ok(win.some((c) => c.endsWith("retroarch.exe")));
  // The Windows 7z unpacks into a RetroArch-Win64 folder on some releases.
  assert.ok(win.some((c) => c.includes("RetroArch-Win64")));

  const linux = runtimeBinaryCandidates(path.join("/tmp/ra", "current"), "linux");
  assert.ok(linux.length > 0);
  assert.ok(!linux.some((c) => c.endsWith(".exe")), "Linux must not look for a .exe");
});

test("ROM extensions still pick the core they always did", () => {
  // Unchanged by the platform work — pinned so it stays that way.
  assert.equal(coreForExtension(".gb"), "gambatte");
  assert.equal(coreForExtension("gbc"), "gambatte");
  assert.equal(coreForExtension(".gba"), "mgba");
  assert.equal(coreForExtension(".sfc"), "snes9x");
  assert.equal(coreForExtension(".gen"), "genesis_plus_gx");
  assert.equal(coreForExtension(".xyz"), null);
});
