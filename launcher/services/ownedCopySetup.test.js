/**
 * A copy the player already owns gets the same setup as one we downloaded.
 *
 * Every detection path — Locate, a known path, the registry, the drive scan —
 * converges on markInstalledFromExe. It recorded the game and set up mods, and
 * stopped there, while the download path also laid down the game-assets
 * overlay, wrote the classic-DOS config, applied edition post-install and
 * pointed OpenMW-family engines at their data.
 *
 * The case that surfaced it: a player with Tyrian from GOG. That folder holds
 * the original DOS build and nothing else, so the launcher had only DOS
 * binaries to pick from, correctly wrapped one in DOSBox, and left them at a
 * DOS prompt — while our own package would have given them the native engine
 * over the same data.
 *
 * Run: node services/ownedCopySetup.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

/** A top-level function body, brace-matched. */
function fn(name) {
  const start = MAIN.indexOf(`\nasync function ${name}(`) + 1 || MAIN.indexOf(`\nfunction ${name}(`) + 1;
  assert.ok(start > 0, `${name} not found — main.js has been restructured`);
  let i = MAIN.indexOf("{", start);
  let d = 0;
  for (; i < MAIN.length; i += 1) {
    if (MAIN[i] === "{") d += 1;
    else if (MAIN[i] === "}") {
      d -= 1;
      if (d === 0) break;
    }
  }
  return MAIN.slice(start, i + 1);
}

test("every detection path runs the owned-copy setup", () => {
  /*
   * markInstalledFromExe is the single convergence point, which is why the
   * call belongs there rather than in each caller.
   */
  assert.match(
    fn("markInstalledFromExe"),
    /applyOwnedCopySetup\(slug, entry, dir, exe\)/,
    "a located copy no longer gets our setup"
  );
});

test("it applies the steps the download path applies", () => {
  const body = fn("applyOwnedCopySetup");
  for (const step of [
    "entry.overlayUrl",
    "prepareClassicDosInstall",
    "maybeApplyEditionPostInstall",
    "maybeConfigureOpenMw",
  ]) {
    assert.ok(body.includes(step), `owned copies miss ${step}`);
  }
});

test("it does not try to extract or rediscover anything", () => {
  /*
   * The folder is the player's and the exe is the one they pointed at.
   * Extracting or unwrapping someone's own install would be destructive, and
   * re-running exe discovery would override their choice.
   */
  const body = fn("applyOwnedCopySetup");
  for (const wrong of ["extractArchive(", "unwrapSingleRootDirectory(", "findExecutable("]) {
    assert.ok(!body.includes(wrong), `owned-copy setup must not call ${wrong}`);
  }
});

test("it never removes the player's files", () => {
  // It may add ours and replace ours; their install must survive intact.
  const body = fn("applyOwnedCopySetup");
  assert.ok(!/fsp\.rm\(|rmSync\(|\brimraf\b/.test(body), "owned-copy setup deletes from a folder we do not own");
});

test("a failure leaves the game registered and playable", () => {
  /*
   * The copy is already recorded by the time this runs. Throwing would take a
   * working registration away over an optional extra.
   */
  const body = fn("applyOwnedCopySetup");
  assert.match(body, /try \{/, "no guard around the setup steps");
  assert.match(body, /catch \(err\)/, "a failing step would propagate");
  assert.match(body, /console\.warn/, "a failure should be visible in the log");
});

test("it is fire-and-forget, so locating stays responsive", () => {
  // Same treatment as the mod setup directly below it.
  assert.match(fn("markInstalledFromExe"), /void applyOwnedCopySetup\(/);
});

test("the download path still runs these itself", () => {
  /*
   * This adds a second caller; it does not move the steps. If the install tail
   * lost them, a downloaded game would quietly stop being configured.
   */
  const installTail = MAIN.slice(MAIN.indexOf("await prepareClassicDosInstall(entry, gameDir);"));
  assert.match(installTail.slice(0, 1200), /await maybeApplyEditionPostInstall\(entry, gameDir\)/);
  assert.match(installTail.slice(0, 1200), /await maybeConfigureOpenMw\(gameDir\)/);
});
