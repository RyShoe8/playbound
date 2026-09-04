/**
 * Which DOSBox Staging build each platform can actually install.
 *
 * Every DOS title in the catalog — Daggerfall, TES: Arena — needs DOSBox
 * fetched before the game runs. The asset filter matched only `.zip`, and
 * upstream ships a zip for Windows alone: macOS gets a .dmg and Linux a
 * .tar.xz. So both platforms failed at "No DOSBox Staging zip" before the game
 * was ever reached, while Windows worked and hid it.
 *
 * Run: node services/dosboxAsset.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

/** The real selection functions, lifted from the service. */
function loadPicker(platform, arch = "x64") {
  const src = fs.readFileSync(path.join(__dirname, "ManagedDosBox.js"), "utf8");
  const grab = (name) => {
    const s = src.indexOf(`function ${name}(`);
    assert.notEqual(s, -1, `${name} not found — ManagedDosBox has been restructured`);
    let i = src.indexOf("{", s);
    let d = 0;
    for (; i < src.length; i += 1) {
      if (src[i] === "{") d += 1;
      else if (src[i] === "}") {
        d -= 1;
        if (d === 0) break;
      }
    }
    return src.slice(s, i + 1);
  };
  return new Function(
    "process",
    `${grab("hostAssetPattern")} ${grab("hostArchivePattern")} ${grab("pickDosBoxAsset")}
     return pickDosBoxAsset;`
  )({ platform, arch });
}

/** DOSBox Staging v0.83.0, as published. */
const RELEASE = [
  { name: "dosbox-staging-linux-x86_64-v0.83.0.tar.xz" },
  { name: "dosbox-staging-macOS-v0.83.0.dmg" },
  { name: "dosbox-staging-windows-x64-v0.83.0-setup.exe" },
  { name: "dosbox-staging-windows-x64-v0.83.0.zip" },
];

test("every platform resolves a DOSBox build", () => {
  for (const [platform, arch] of [
    ["win32", "x64"],
    ["darwin", "arm64"],
    ["darwin", "x64"],
    ["linux", "x64"],
  ]) {
    const got = loadPicker(platform, arch)(RELEASE);
    assert.ok(got, `${platform}/${arch} resolved nothing — DOS games cannot install there`);
  }
});

test("each platform gets a format it can open", () => {
  assert.match(loadPicker("win32")(RELEASE).name, /\.zip$/);
  assert.match(loadPicker("darwin")(RELEASE).name, /\.dmg$/);
  assert.match(loadPicker("linux")(RELEASE).name, /\.tar\.xz$/);
});

test("the Windows installer exe is never chosen", () => {
  /*
   * -setup.exe is an installer to click through, not an archive to unpack.
   * Picking it would swap a clear failure for a stuck one.
   */
  assert.doesNotMatch(loadPicker("win32")(RELEASE).name, /setup\.exe$/);
});

test("debug and symbol builds are skipped", () => {
  const withDebug = [
    { name: "dosbox-staging-windows-x64-v0.83.0-debug.zip" },
    { name: "dosbox-staging-windows-x64-v0.83.0.zip" },
  ];
  assert.equal(
    loadPicker("win32")(withDebug).name,
    "dosbox-staging-windows-x64-v0.83.0.zip"
  );
});

test("an Apple Silicon build wins on Apple Silicon when one is published", () => {
  const both = [
    { name: "dosbox-staging-macOS-arm64-v0.83.0.dmg" },
    { name: "dosbox-staging-macOS-x86_64-v0.83.0.dmg" },
  ];
  assert.match(loadPicker("darwin", "arm64")(both).name, /arm64/);
  assert.match(loadPicker("darwin", "x64")(both).name, /x86_64/);
});

test("a release with nothing usable resolves null rather than a foreign build", () => {
  // Better to fail with a clear message than to hand macOS a Windows zip.
  const winOnly = [{ name: "dosbox-staging-windows-x64-v0.83.0.zip" }];
  assert.equal(loadPicker("darwin")(winOnly), null);
  assert.equal(loadPicker("linux")(winOnly), null);
});
