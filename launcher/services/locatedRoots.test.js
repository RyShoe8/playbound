/**
 * Which folders a located install is allowed to launch from.
 *
 * This is a security boundary — it exists so the launcher will not spawn
 * whatever a catalog row or a drive scan happens to name — so the cases that
 * must stay refused matter as much as the ones that must now pass.
 *
 * The two functions are lifted out of main.js rather than reimplemented, the
 * same way itchDiagnose.test.js does it: the behaviour under test is the code
 * that actually runs, not a copy of it that agrees with the test.
 *
 * Run: node services/locatedRoots.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

function loadFromMain() {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

  function extract(name) {
    const start = src.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} not found in main.js`);
    let i = src.indexOf("{", start);
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}" && --depth === 0) break;
    }
    return src.slice(start, i + 1);
  }

  // `path` is injected rather than required: new Function has no module scope.
  const body = `
    ${extract("normalizeFsPath")}
    ${extract("pathUnderRoot")}
    let saved = null;
    let settings = { locatedRoots: [] };
    const loadSettings = () => JSON.parse(JSON.stringify(settings));
    const saveSettings = (next) => { settings = next; saved = next; };
    const console = { warn() {} };
    const process = { platform: "win32" };
    ${extract("rememberLocatedRoot")}
    return {
      rememberLocatedRoot,
      pathUnderRoot,
      roots: () => settings.locatedRoots,
      setRoots: (r) => { settings.locatedRoots = r; },
      saved: () => saved,
    };
  `;
  return new Function("path", body)(path);
}

const m = loadFromMain();

test("remembers the folder a picked executable lives in", () => {
  // Not the file: a game rarely launches the exe you pointed at. Bootstrappers,
  // edition binaries and mod loaders all sit beside it.
  m.setRoots([]);
  m.rememberLocatedRoot("D:\\Games\\RedEclipse\\redeclipse.exe");
  assert.deepEqual(m.roots(), [path.resolve("D:\\Games\\RedEclipse")]);
});

test("trusts what it remembered, and nothing above it", () => {
  m.setRoots([]);
  m.rememberLocatedRoot("D:\\Games\\RedEclipse\\bin\\redeclipse.exe");
  const root = m.roots()[0];
  assert.equal(m.pathUnderRoot("D:\\Games\\RedEclipse\\bin\\redeclipse.exe", root), true);
  // A sibling binary in the same folder is the point of storing the folder.
  assert.equal(m.pathUnderRoot("D:\\Games\\RedEclipse\\bin\\launcher.exe", root), true);
  // The parent is not implied. Picking one game must not trust every game.
  assert.equal(m.pathUnderRoot("D:\\Games\\SomethingElse\\evil.exe", root), false);
  assert.equal(m.pathUnderRoot("D:\\Games\\RedEclipse\\other.exe", root), false);
});

test("never trusts a whole drive", () => {
  /*
   * Picking D:\\game.exe would otherwise store "D:\\" and hand the launcher
   * permission to spawn anything on the disk. That case remembers the one file.
   */
  m.setRoots([]);
  m.rememberLocatedRoot("D:\\game.exe");
  const stored = m.roots()[0];
  assert.equal(stored, path.resolve("D:\\game.exe"));
  assert.equal(m.pathUnderRoot("D:\\game.exe", stored), true);
  assert.equal(m.pathUnderRoot("D:\\anything-else.exe", stored), false);
});

test("does not accumulate duplicates for the same folder", () => {
  m.setRoots([]);
  m.rememberLocatedRoot("D:\\Games\\RedEclipse\\redeclipse.exe");
  m.rememberLocatedRoot("D:\\Games\\RedEclipse\\redeclipse.exe");
  m.rememberLocatedRoot("D:\\Games\\RedEclipse\\sub\\other.exe");
  assert.equal(m.roots().length, 1, `expected one root, got ${JSON.stringify(m.roots())}`);
});

test("a newly chosen parent replaces the children it contains", () => {
  // Otherwise the list grows one entry per game forever and the narrower
  // entries are dead weight.
  m.setRoots([]);
  m.rememberLocatedRoot("D:\\Games\\A\\a.exe");
  m.rememberLocatedRoot("D:\\Games\\B\\b.exe");
  assert.equal(m.roots().length, 2);
  m.rememberLocatedRoot("D:\\Games\\top.exe");
  assert.deepEqual(m.roots(), [path.resolve("D:\\Games")]);
});

test("keeps the list bounded", () => {
  m.setRoots([]);
  for (let i = 0; i < 80; i++) m.rememberLocatedRoot(`D:\\Games\\G${i}\\g.exe`);
  assert.equal(m.roots().length, 50);
});

test("survives rubbish without throwing, because a launch depends on it", () => {
  m.setRoots([]);
  assert.doesNotThrow(() => m.rememberLocatedRoot(""));
  assert.doesNotThrow(() => m.rememberLocatedRoot(null));
  assert.doesNotThrow(() => m.rememberLocatedRoot(undefined));
});
