/**
 * Shared DOSBox Staging launch helper.
 *
 * Run: node services/ManagedDosBox.test.js
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const { dosBoxLaunchSpec, pickDosBoxAsset } = require("./ManagedDosBox");

test("Arena A.EXE mounts its own folder as C:, not the parent install", () => {
  const dosExe = path.join("C:", "Games", "tes-arena", "ARENA", "A.EXE");
  const spec = dosBoxLaunchSpec(dosExe);
  assert.equal(spec.cwd, path.join("C:", "Games", "tes-arena", "ARENA"));
  const mount = spec.args[spec.args.indexOf("-c") + 1];
  assert.match(mount, /mount c /i);
  assert.match(mount, /ARENA/i);
  assert.doesNotMatch(mount, /tes-arena["/]*$/i);
  assert.ok(spec.args.includes("A.EXE"));
  assert.ok(spec.args.includes("exit"));
});

test("paths with spaces are quoted for DOSBox -c", () => {
  const dosExe = path.join("C:", "Program Files", "Arena", "A.EXE");
  const spec = dosBoxLaunchSpec(dosExe);
  const mount = spec.args[spec.args.indexOf("-c") + 1];
  assert.match(mount, /^mount c "/);
});

test("DOS program arguments are part of the command before exit", () => {
  const spec = dosBoxLaunchSpec(path.join("C:", "Games", "daggerfall", "FALL.EXE"), ["Z.CFG"]);
  const commands = spec.args.filter((value, index) => spec.args[index - 1] === "-c");
  assert.ok(commands.includes("FALL.EXE Z.CFG"));
  assert.ok(commands.indexOf("FALL.EXE Z.CFG") < commands.indexOf("exit"));
});

test("pickDosBoxAsset prefers a Windows x64 zip", () => {
  const asset = pickDosBoxAsset([
    { name: "dosbox-staging-windows-msvc-x86_64-v0.82.2.zip", browser_download_url: "https://example/win.zip" },
    { name: "dosbox-staging-macos-arm64-v0.82.2.zip", browser_download_url: "https://example/mac.zip" },
    { name: "dosbox-staging-linux-x86_64.tar.xz", browser_download_url: "https://example/linux.txz" },
  ]);
  if (process.platform === "win32") {
    assert.equal(asset.name, "dosbox-staging-windows-msvc-x86_64-v0.82.2.zip");
  }
});
