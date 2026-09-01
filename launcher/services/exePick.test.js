/**
 * Which executable a package's install resolves to.
 *
 * Streets of Rage Remake ships SorR.exe — the game — beside the larger
 * SorMaker.exe, its level editor. findExecutable ranked every .exe equally and
 * broke the tie on size, so Play opened the editor and the editor told the
 * player to unlock it. The recipe had named SorR.exe in knownExePaths all
 * along; nothing consulted it at install time.
 *
 * These run the shipped main.js logic against real files on disk rather than a
 * reimplementation, because the bug was in the ranking itself.
 *
 * Run: node services/exePick.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * findExecutable and exeHintFor live in main.js, which cannot be required — it
 * boots Electron. Extract just those two declarations and evaluate them with
 * the handful of globals they touch.
 */
function loadPicker() {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

  const grab = (name) => {
    const start = src.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} not found in main.js`);
    let depth = 0;
    let i = src.indexOf("{", start);
    const open = i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    assert.ok(i > open, `${name} braces did not balance`);
    return src.slice(start, i + 1);
  };

  const factory = new Function(
    "fs",
    "path",
    "process",
    "expandWinPath",
    "preferRunnableExecutable",
    `${grab("findExecutable")}
     ${grab("exeHintFor")}
     ${grab("preferRunnableCandidate")}
     return { findExecutable, exeHintFor };`
  );

  return factory(
    fs,
    path,
    { platform: "win32" },
    (p) => p,
    // The real one reads PE headers; here every candidate is runnable, so the
    // rank-then-size order is what is under test.
    (paths) => paths[0]
  );
}

const { findExecutable, exeHintFor } = loadPicker();

/** A throwaway install directory with the given files, largest listed first. */
function makeInstall(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-exepick-"));
  for (const [name, size] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), Buffer.alloc(size, 0));
  }
  return dir;
}

test("knownExePaths becomes the hint when a recipe has no exeHint", () => {
  assert.equal(exeHintFor({ knownExePaths: ["SorR.exe"] }), "SorR.exe");
  assert.equal(exeHintFor({ exeHint: "Game", knownExePaths: ["Other.exe"] }), "Game");
  assert.equal(exeHintFor({}), undefined);
  assert.equal(exeHintFor({ knownExePaths: [] }), undefined);
});

test("multiple knownExePaths all become alternatives", () => {
  const hint = exeHintFor({ knownExePaths: ["bin\\\\Game.exe", "Game64.exe"] });
  assert.equal(hint, "Game.exe|Game64.exe");
});

test("Streets of Rage Remake launches the game, not the level editor", () => {
  // The editor really is the bigger file, which is what beat the game before.
  const dir = makeInstall({ "SorMaker.exe": 9_000_000, "SorR.exe": 4_000_000 });
  try {
    const picked = findExecutable(dir, exeHintFor({ knownExePaths: ["SorR.exe"] }));
    assert.equal(path.basename(picked), "SorR.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an editor loses to a game even with no hint at all", () => {
  const dir = makeInstall({ "SorMaker.exe": 9_000_000, "SorR.exe": 4_000_000 });
  try {
    // This is the case a recipe with neither field would hit.
    assert.equal(path.basename(findExecutable(dir, undefined)), "SorR.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a tool still launches when it is the only executable", () => {
  // Demoted, never excluded — a package that ships only an editor must not
  // become unlaunchable.
  const dir = makeInstall({ "LevelEditor.exe": 2_000_000 });
  try {
    assert.equal(path.basename(findExecutable(dir, undefined)), "LevelEditor.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("size still decides between two ordinary executables", () => {
  const dir = makeInstall({ "Small.exe": 1_000, "Large.exe": 5_000_000 });
  try {
    assert.equal(path.basename(findExecutable(dir, undefined)), "Large.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("config front-ends lose to the game they configure", () => {
  const dir = makeInstall({ "GameConfig.exe": 8_000_000, "Game.exe": 1_500_000 });
  try {
    assert.equal(path.basename(findExecutable(dir, undefined)), "Game.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
