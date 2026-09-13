const assert = require("node:assert/strict");
const test = require("node:test");
const { mayRunNativeUninstaller, editionLaunchExecutable } = require("./editionLifecycle");

test("only installer-backed official editions invoke a native product uninstaller", () => {
  assert.equal(mayRunNativeUninstaller("tes3mp", { kind: "direct-installer" }), false);
  assert.equal(mayRunNativeUninstaller("official", { kind: "direct-installer" }), true);
  assert.equal(mayRunNativeUninstaller("official", { kind: "github-installer" }), true);
  assert.equal(mayRunNativeUninstaller("official", { kind: "direct-zip" }), false);
  assert.equal(mayRunNativeUninstaller(null), true);
  assert.equal(mayRunNativeUninstaller(null, { kind: "direct-zip" }), false);
  assert.equal(mayRunNativeUninstaller(null, { kind: "github-zip" }), false);
  assert.equal(mayRunNativeUninstaller(null, { kind: "direct-exe" }), false);
  assert.equal(mayRunNativeUninstaller(null, { kind: "direct-installer" }), true);
});

test("last owner of a shared installer path may run the product uninstaller", () => {
  assert.equal(
    mayRunNativeUninstaller("uqm-classic", { kind: "direct-installer" }, { lastOwnerOfInstallPath: true }),
    true
  );
  assert.equal(
    mayRunNativeUninstaller("uqm-classic", { kind: "direct-zip" }, { lastOwnerOfInstallPath: true }),
    false
  );
  assert.equal(
    mayRunNativeUninstaller("uqm-classic", { kind: "direct-installer" }),
    false
  );
});

test("normal TES3MP play keeps the client for its locally hosted server", () => {
  const info = { dir: "C:\\Games\\morrowind\\tes3mp", exe: "C:\\Games\\morrowind\\tes3mp\\tes3mp.exe" };
  assert.equal(
    editionLaunchExecutable(info, { gameSlug: "morrowind", editionSlug: "tes3mp", joining: false }),
    info.exe
  );
});

test("TES3MP Join Game keeps the connect-capable client", () => {
  const info = { dir: "C:\\Games\\morrowind\\tes3mp", exe: "C:\\Games\\morrowind\\tes3mp\\tes3mp.exe" };
  assert.equal(
    editionLaunchExecutable(info, { gameSlug: "morrowind", editionSlug: "tes3mp", joining: true }),
    info.exe
  );
});

test("missing browser and unrelated editions retain their installed executable", () => {
  const info = { dir: "C:\\Games\\morrowind\\tes3mp", exe: "C:\\Games\\morrowind\\tes3mp\\tes3mp.exe" };
  assert.equal(
    editionLaunchExecutable(info, { gameSlug: "morrowind", editionSlug: "tes3mp" }, () => false),
    info.exe
  );
  assert.equal(
    editionLaunchExecutable(info, { gameSlug: "morrowind", editionSlug: "openmw" }, () => true),
    info.exe
  );
});
