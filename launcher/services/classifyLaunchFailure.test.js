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
