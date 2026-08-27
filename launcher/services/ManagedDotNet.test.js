/**
 * Managed .NET Desktop Runtime helpers.
 *
 * Run: node services/ManagedDotNet.test.js
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const fsp = require("node:fs/promises");

const {
  requiredDotNetMajor,
  launchEnvForRoot,
  hasMajorUnder,
  isUsableDotNetRoot,
  DOTNET_MAJOR,
  winRid,
} = require("./ManagedDotNet");

test("requiredDotNetMajor reads the catalog field", () => {
  assert.equal(requiredDotNetMajor({ needsDotNetMajor: 10 }), 10);
  assert.equal(requiredDotNetMajor({ needsDotNetMajor: "10" }), 10);
  assert.equal(requiredDotNetMajor({ needsDotNetMajor: 0 }), null);
  assert.equal(requiredDotNetMajor({}), null);
  assert.equal(requiredDotNetMajor(null), null);
});

test("requiredDotNetMajor falls back for space-station-14 before the flag syncs", () => {
  assert.equal(requiredDotNetMajor({ slug: "space-station-14" }), DOTNET_MAJOR);
  assert.equal(requiredDotNetMajor({ slug: "openra" }), null);
});

test("launchEnvForRoot pins DOTNET_ROOT and disables multilevel lookup", () => {
  const env = launchEnvForRoot("C:\\PlayBound\\runtimes\\dotnet\\current");
  assert.equal(env.DOTNET_ROOT, "C:\\PlayBound\\runtimes\\dotnet\\current");
  assert.equal(env.DOTNET_MULTILEVEL_LOOKUP, "0");
});

test("hasMajorUnder matches major and patch folders", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "playbound-dotnet-test-"));
  try {
    const shared = path.join(root, "shared", "Microsoft.NETCore.App");
    await fsp.mkdir(path.join(shared, "10.0.11"), { recursive: true });
    assert.equal(hasMajorUnder(shared, 10), true);
    assert.equal(hasMajorUnder(shared, 9), false);
    assert.equal(hasMajorUnder(path.join(root, "missing"), 10), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("isUsableDotNetRoot requires host + a matching shared framework", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "playbound-dotnet-root-"));
  try {
    assert.equal(isUsableDotNetRoot(root), false);
    const host = path.join(root, process.platform === "win32" ? "dotnet.exe" : "dotnet");
    await fsp.writeFile(host, "");
    assert.equal(isUsableDotNetRoot(root), false);
    await fsp.mkdir(path.join(root, "shared", "Microsoft.WindowsDesktop.App", "10.0.11"), {
      recursive: true,
    });
    assert.equal(isUsableDotNetRoot(root), true);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("winRid follows process.arch", () => {
  assert.ok(winRid() === "win-x64" || winRid() === "win-arm64");
});

test("release metadata lists a zip for this machine's RID", async () => {
  // Live network: catches Microsoft renaming the metadata shape before a player does.
  const { resolveDesktopRuntimeZip } = require("./ManagedDotNet");
  const asset = await resolveDesktopRuntimeZip(winRid());
  assert.match(asset.url, /^https:\/\//);
  assert.match(asset.url, /\.zip$/i);
  assert.match(asset.version, /^10\./);
});
