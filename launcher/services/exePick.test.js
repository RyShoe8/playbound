/**
 * Which executable a package's install resolves to.
 *
 * Streets of Rage Remake ships SorR.exe — the game — beside SorMaker.exe, its
 * level editor. findExecutable ranked every .exe equally and broke ties on
 * size; these two are byte-for-byte the same size, so the tie fell through to
 * directory order and SorMaker won. Play opened the editor, which then told the
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
  /*
   * The real sizes, read off an install: both stubs are exactly 14,336 bytes,
   * because each is a small Bennu loader beside its own .dat — SorR.dat is
   * 253MB, SorMaker.dat is 4.7MB. So size could never separate them and the
   * tie fell through to directory order, where SorMaker sorts first. An
   * earlier version of this test used 9MB against 4MB and passed for the wrong
   * reason.
   */
  const dir = makeInstall({ "SorMaker.exe": 14_336, "SorR.exe": 14_336 });
  try {
    const picked = findExecutable(dir, exeHintFor({ knownExePaths: ["SorR.exe"] }));
    assert.equal(path.basename(picked), "SorR.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an editor loses to a game even with no hint at all", () => {
  const dir = makeInstall({ "SorMaker.exe": 14_336, "SorR.exe": 14_336 });
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

test("an EAC-protected game launches through its bootstrap, not its binary", () => {
  /*
   * Strikers Club's real sizes, read off the Steam install: the EAC bootstrap
   * is 3.8MB beside a 162MB shipping binary, so ranking by size picked the
   * binary — and EAC refuses an unprotected launch, which surfaces to the
   * player as the game demanding to be run through Steam.
   */
  const dir = makeInstall({
    "start_protected_game.exe": 3_985_408,
    "UFG.exe": 524_288,
  });
  try {
    assert.equal(path.basename(findExecutable(dir, undefined)), "start_protected_game.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the anti-cheat installer is never mistaken for the game", () => {
  // EasyAntiCheat_EOS_Setup.exe ships in the same tree; the skip rule has to
  // keep matching it, or a package with no other candidate would launch it.
  const dir = makeInstall({
    "EasyAntiCheat_EOS_Setup.exe": 943_000,
    "start_protected_game.exe": 3_985_408,
  });
  try {
    assert.equal(path.basename(findExecutable(dir, undefined)), "start_protected_game.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a hint still wins over the bootstrap when a recipe names one", () => {
  // The bootstrap outranks ordinary executables, but a recipe that explicitly
  // names an executable is a deliberate statement and must still be honoured.
  const dir = makeInstall({
    "start_protected_game.exe": 3_985_408,
    "Launcher.exe": 800_000,
  });
  try {
    assert.equal(path.basename(findExecutable(dir, "Launcher.exe")), "Launcher.exe");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
