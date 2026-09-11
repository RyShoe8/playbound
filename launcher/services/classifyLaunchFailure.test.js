const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyLaunchFailure } = require("./classifyLaunchFailure");

test("native early exit keeps EARLY_EXIT (HoloCure is not Java)", () => {
  const err = new Error(
    "The game exited immediately after launch (HoloCure.exe). Open Folder and try running it manually, check GPU drivers, or reinstall."
  );
  err.code = "EARLY_EXIT";
  const out = classifyLaunchFailure(err, "C:\\Games\\holocure\\HoloCure.exe");
  assert.equal(out.code, "EARLY_EXIT");
  assert.match(out.message, /HoloCure\.exe/);
});

test("jar early exit keeps JAVA_EARLY_EXIT", () => {
  const err = new Error("The game exited immediately after launch.");
  err.code = "JAVA_EARLY_EXIT";
  const out = classifyLaunchFailure(err, "/games/foo/game.jar");
  assert.equal(out.code, "JAVA_EARLY_EXIT");
});

test("message-only early exit on non-jar is EARLY_EXIT, not JAVA", () => {
  const err = new Error("The game exited immediately after launch (game.exe).");
  const out = classifyLaunchFailure(err, "D:\\PlayBound\\Games\\foo\\game.exe");
  assert.equal(out.code, "EARLY_EXIT");
});

test("message-only early exit on jar is JAVA_EARLY_EXIT", () => {
  const err = new Error("The game exited immediately after launch.");
  const out = classifyLaunchFailure(err, "/opt/game/server.jar");
  assert.equal(out.code, "JAVA_EARLY_EXIT");
});

test("TES3MP early exit without Morrowind data is MORROWIND_DATA_MISSING", () => {
  const err = new Error(
    "The game exited immediately after launch (tes3mp.exe). Open Folder and try running it manually, check GPU drivers, or reinstall."
  );
  err.code = "EARLY_EXIT";
  err.stderrTail = "No content file given (esm/esp, nor omwgame/omwaddon). Aborting...";
  err.exeBasename = "tes3mp.exe";
  const out = classifyLaunchFailure(err, "C:\\Games\\tes3mp\\tes3mp.exe", {
    morrowindDataFound: false,
    editionSlug: "tes3mp",
    gameSlug: "morrowind",
  });
  assert.equal(out.code, "MORROWIND_DATA_MISSING");
  assert.match(out.message, /Morrowind\.esm/);
  assert.equal(out.exeBasename, "tes3mp.exe");
  assert.match(out.stderrTail || "", /No content file given/);
});

test("OpenMW early exit with data found stays EARLY_EXIT", () => {
  const err = new Error("The game exited immediately after launch (openmw.exe).");
  err.code = "EARLY_EXIT";
  const out = classifyLaunchFailure(err, "C:\\Games\\openmw\\openmw.exe", {
    morrowindDataFound: true,
    editionSlug: "openmw",
    gameSlug: "morrowind",
  });
  assert.equal(out.code, "EARLY_EXIT");
});

test("forwards exitCode and signal on classified failures", () => {
  const err = new Error("The game exited immediately after launch (game.exe).");
  err.code = "EARLY_EXIT";
  err.exitCode = 1;
  err.signal = "SIGTERM";
  err.stderrTail = "boom";
  const out = classifyLaunchFailure(err, "C:\\game.exe");
  assert.equal(out.exitCode, 1);
  assert.equal(out.signal, "SIGTERM");
  assert.equal(out.stderrTail, "boom");
});
