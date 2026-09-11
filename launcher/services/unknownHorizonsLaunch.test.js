const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  isUnknownHorizonsSlug,
  resolveUnknownHorizonsLaunch,
} = require("./unknownHorizonsLaunch");

assert.strictEqual(isUnknownHorizonsSlug("unknown-horizons"), true);
assert.strictEqual(isUnknownHorizonsSlug("other"), false);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "uh-launch-"));
const gameDir = path.join(root, "unknown-horizons");
const pyDir = path.join(root, "python");
fs.mkdirSync(gameDir, { recursive: true });
fs.mkdirSync(pyDir, { recursive: true });
const script = path.join(gameDir, "run_uh.py");
const bat = path.join(gameDir, "run_uh.bat");
const pythonw = path.join(pyDir, "pythonw.exe");
fs.writeFileSync(script, "# stub\n");
fs.writeFileSync(bat, "@echo off\n");
fs.writeFileSync(pythonw, "");

const fromBat = resolveUnknownHorizonsLaunch(bat);
assert.ok(fromBat);
assert.strictEqual(fromBat.exe, pythonw);
assert.deepStrictEqual(fromBat.args, [script]);
assert.strictEqual(fromBat.cwd, gameDir);

const fromPy = resolveUnknownHorizonsLaunch(script, root);
assert.ok(fromPy);
assert.strictEqual(fromPy.exe, pythonw);

assert.strictEqual(
  resolveUnknownHorizonsLaunch(path.join(os.tmpdir(), "no-such-uh-install", "missing.bat")),
  null
);

console.log("unknownHorizonsLaunch.test.js: ok");
