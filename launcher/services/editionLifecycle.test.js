const assert = require("node:assert/strict");
const test = require("node:test");
const { mayRunNativeUninstaller, editionLaunchExecutable } = require("./editionLifecycle");

test("removing one edition never invokes a native product uninstaller", () => {
  assert.equal(mayRunNativeUninstaller("tes3mp"), false);
  assert.equal(mayRunNativeUninstaller("official"), false);
  assert.equal(mayRunNativeUninstaller(null), true);
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
