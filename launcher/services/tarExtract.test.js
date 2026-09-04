/**
 * Tarballs must be handed to `tar`, not to 7-Zip.
 *
 * 7zip-bin ships a 7za for linux and mac as well as win, so sevenZipBinary()
 * is never null on the two platforms that actually receive tarballs. With the
 * 7z branch tested first, the tar branch was unreachable everywhere — and it
 * failed quietly rather than loudly: 7-Zip treats gzip and xz as single-file
 * compressors, so it unwrapped one layer, wrote a bare .tar into the game
 * directory, and exited 0. Nothing threw, so the catch never fired and the
 * install "succeeded" with no game in it.
 *
 * The order of those two branches is the whole fix, so it is what this pins.
 *
 * Run: node services/tarExtract.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

/** Pull a top-level function out of main.js by name, brace-matched. */
function grab(name) {
  const start = MAIN.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found — main.js has been restructured`);
  let i = MAIN.indexOf("{", start);
  let depth = 0;
  for (; i < MAIN.length; i += 1) {
    if (MAIN[i] === "{") depth += 1;
    else if (MAIN[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return MAIN.slice(start, i + 1);
}

const isTarball = new Function(`${grab("isTarball")} return isTarball;`)();

test("every tar flavour upstreams publish is recognised", () => {
  for (const name of [
    "7kaa-2.15.7-x86-64.tar.gz",
    "dosbox-staging-linux-x86_64-v0.83.0.tar.xz",
    "openttd-14.1-linux-generic-amd64.tar.xz",
    "game.tgz",
    "game.txz",
    "game.tar.bz2",
    "game.tbz2",
    "plain.tar",
  ]) {
    assert.ok(isTarball(name), `${name} should route to tar`);
  }
});

test("archives 7-Zip and the zip reader own are left alone", () => {
  for (const name of [
    "RetroArch.7z",
    "meteorite-linux.zip",
    "RetroArch.dmg",
    "7kaa-install-2.15.7-win32.exe",
    // Not a tarball: the name merely contains the letters.
    "startaris.zip",
    "guitar.zip",
  ]) {
    assert.ok(!isTarball(name), `${name} should not route to tar`);
  }
});

test("nothing in, nothing out", () => {
  assert.ok(!isTarball(""));
  assert.ok(!isTarball(null));
  assert.ok(!isTarball(undefined));
});

test("the tar branch is tested before the 7-Zip branch", () => {
  /*
   * The regression this file exists for. If these two ever swap back, every
   * .tar.gz install on Linux and macOS silently produces a .tar instead of a
   * game, and no other test in the suite notices.
   */
  const body = grab("extractArchive");
  const tarAt = body.indexOf("isTarball(");
  const sevenAt = body.indexOf("} else if (sevenZipBinary())");

  assert.ok(tarAt > -1, "extractArchive no longer dispatches on isTarball");
  assert.ok(sevenAt > -1, "extractArchive no longer has a 7-Zip branch");
  // Delimit on the branch itself: the prose above it names the function too.
  assert.ok(
    tarAt < sevenAt,
    "the 7-Zip branch would swallow tarballs again — tar must be checked first"
  );
});

test("Windows still refuses tarballs loudly rather than mangling them", () => {
  const body = grab("extractArchive");
  const tarAt = body.indexOf("isTarball(");
  const guard = body.slice(tarAt, body.indexOf("} else if (sevenZipBinary())"));
  assert.match(guard, /win32/, "the Windows guard has left the tar branch");
  assert.match(guard, /throw new Error/, "Windows must throw, not fall through");
});

test("a tarball is never routed to the installer or direct-exe branches", () => {
  /*
   * 7KAA ships a setup .exe on Windows and a .tar.gz on Linux from one
   * direct-installer recipe. Unguarded, Linux got shell.openPath on a tarball
   * — the desktop archive manager, then an installer poll that never ends.
   */
  assert.match(
    MAIN,
    /const downloadIsTarball = isTarball\(dl\.name\);/,
    "the tarball check on the resolved download has gone"
  );
  assert.match(
    MAIN,
    /if \(!downloadIsTarball && \(entry\.kind === "github-installer" \|\| entry\.kind === "direct-installer"\)\)/,
    "the installer branch would openPath a tarball again"
  );
  assert.match(
    MAIN,
    /if \(!downloadIsTarball && entry\.kind === "direct-exe"\)/,
    "the direct-exe branch would copy a tarball to <slug>.exe again"
  );
});
