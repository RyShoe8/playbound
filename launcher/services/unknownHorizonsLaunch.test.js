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
const fifeDir = path.join(pyDir, "Lib", "site-packages", "fife");
fs.mkdirSync(gameDir, { recursive: true });
fs.mkdirSync(fifeDir, { recursive: true });
const script = path.join(gameDir, "run_uh.py");
const bat = path.join(gameDir, "run_uh.bat");
const python = path.join(pyDir, "python.exe");
const pythonw = path.join(pyDir, "pythonw.exe");
fs.writeFileSync(script, "# stub\n");
fs.writeFileSync(bat, "@echo off\n");
fs.writeFileSync(python, "");
fs.writeFileSync(pythonw, "");
fs.writeFileSync(path.join(fifeDir, "libpng16-16.dll"), "");

const fromBat = resolveUnknownHorizonsLaunch(bat);
assert.ok(fromBat);
assert.strictEqual(fromBat.exe, python, "prefer python.exe (matches run_uh.bat)");
assert.deepStrictEqual(fromBat.args, [script, "--debug-log-only"]);
assert.strictEqual(fromBat.cwd, gameDir);
assert.ok(fromBat.env?.PATH?.startsWith(fifeDir), "FIFE DLL dir must lead PATH");
assert.ok(fromBat.env.PATH.includes(pyDir));

const fromPy = resolveUnknownHorizonsLaunch(script, root);
assert.ok(fromPy);
assert.strictEqual(fromPy.exe, python);

/*
 * Official installs live at C:\Unknown-Horizons and are always tried last.
 * A random missing path only stays null when that fallback is absent too.
 */
if (!fs.existsSync(path.join("C:\\Unknown-Horizons", "unknown-horizons", "run_uh.py"))) {
  assert.strictEqual(
    resolveUnknownHorizonsLaunch(path.join(os.tmpdir(), "no-such-uh-install", "missing.bat")),
    null
  );
}

fs.rmSync(root, { recursive: true, force: true });
console.log("unknownHorizonsLaunch.test.js: ok");
