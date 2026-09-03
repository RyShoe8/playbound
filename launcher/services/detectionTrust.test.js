/**
 * Detection is allowed to trust what it found.
 *
 * findKnownExecutable was calling isAllowedExecutablePath on its own results
 * and discarding the ones outside the default folders — so a game installed
 * anywhere else was found and then reported as not installed. Red Eclipse in a
 * custom directory was never detected even though its uninstall key named the
 * folder exactly.
 *
 * These read main.js rather than reimplementing it, so the assertions are about
 * the code that actually runs.
 *
 * Run: node services/detectionTrust.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function findKnownExecutableBody() {
  const start = src.indexOf("function findKnownExecutable(");
  assert.notEqual(start, -1, "findKnownExecutable not found in main.js");
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

const body = findKnownExecutableBody();

test("a registry hit is remembered rather than discarded", () => {
  /*
   * The uninstall key is Windows saying where it put the game. Finding that and
   * refusing it because the folder is not on a list is the bug — and recording
   * it is what stops the launch guard rejecting the same path a moment later.
   */
  const idx = body.indexOf("findExeFromUninstallRegistry(entry)");
  assert.notEqual(idx, -1, "the registry lookup is gone");
  const after = body.slice(idx);
  assert.match(
    after,
    /rememberLocatedRoot\(fromReg\)/,
    "a registry result must be recorded as a trusted root"
  );
});

test("the games directory is still checked before the registry", () => {
  // Order matters: our own install of an edition must win over whatever a
  // store or an installer registered for the same title.
  assert.ok(
    body.indexOf("findExeUnderGamesDir(entry)") < body.indexOf("findExeFromUninstallRegistry(entry)"),
    "the games-directory scan must run first"
  );
});

test("an external entry still never adopts a path from our games folder", () => {
  /*
   * Pre-existing rule worth keeping asserted while this function is being
   * changed: a store-installed edition claiming a sibling's files inside our
   * games directory is destructive, because the mod loader then writes into an
   * install the player expected to stay vanilla.
   */
  assert.match(body, /entry\?\.kind !== "external"/);
});

test("the launch guard itself is unchanged", () => {
  // Widening detection must not widen what may be spawned. The guard still
  // consults the same allowlist; the registry path joins that list explicitly
  // rather than bypassing the check.
  const guardStart = src.indexOf("function isAllowedExecutablePath(");
  assert.notEqual(guardStart, -1);
  const guard = src.slice(guardStart, src.indexOf("}", src.indexOf("return", guardStart)));
  assert.match(guard, /allowedExecutableRoots\(\)/);
});
