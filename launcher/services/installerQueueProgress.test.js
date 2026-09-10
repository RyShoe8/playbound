const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

/** A top-level function body, brace-matched. */
function fn(name) {
  const start = MAIN.indexOf(`\nasync function ${name}(`) + 1 || MAIN.indexOf(`\nfunction ${name}(`) + 1;
  assert.ok(start > 0, `${name} not found — main.js has been restructured`);
  // Find the closing paren of parameters before looking for function body opening brace
  const paramsEnd = MAIN.indexOf(")\n{", start) !== -1
    ? MAIN.indexOf(")\n{", start)
    : MAIN.indexOf(") {", start);
  assert.ok(paramsEnd > start, `closing paren for ${name} not found`);
  let i = MAIN.indexOf("{", paramsEnd);
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

test("main.js tracks installerPollOnComplete at module scope", () => {
  assert.match(MAIN, /let installerPollOnComplete = null;/);
});

test("markInstalled notifies completeInstallerPoll before stopping the poll", () => {
  const body = fn("markInstalled");
  assert.match(
    body,
    /completeInstallerPoll\(slug,/,
    "markInstalled must complete the waiting installer poll when an exe is registered"
  );
  const completeIdx = body.indexOf("completeInstallerPoll(slug,");
  const stopIdx = body.indexOf("stopInstallerPoll();");
  assert.ok(completeIdx > 0 && stopIdx > 0 && completeIdx < stopIdx, "completeInstallerPoll must run before stopInstallerPoll");
});

test("completeInstallerPoll fires onComplete and cleans up", () => {
  const body = fn("completeInstallerPoll");
  assert.match(body, /installerPollOnComplete/, "must retrieve the onComplete callback");
  assert.match(body, /stopInstallerPoll\(\)/, "must stop the poll timer and reset state");
  assert.match(body, /cb\(null,\s*result\)/, "must invoke callback with success result");
});

test("sendProgress does not clobber activeInstallTask when another slug reports progress", () => {
  const body = fn("sendProgress");
  assert.match(
    body,
    /if\s*\(activeInstallTask\s*&&\s*\(!payload\.slug\s*\|\|\s*payload\.slug\s*===\s*activeInstallTask\.slug\)\)/,
    "sendProgress must guard activeInstallTask from queued game progress events"
  );
});

test("installGame waits for activeInstallTask before starting queued item", () => {
  const body = fn("installGame");
  assert.match(
    body,
    /while\s*\(activeInstallTask\s*&&\s*activeInstallTask\s*!==\s*task\)/,
    "queued task must wait until activeInstallTask has finished"
  );
});

test("installer poll flow simulation: marking installed resolves installer promise", async () => {
  let installerPollSlug = null;
  let installerPollOnComplete = null;
  let installerPollTimer = null;

  function stopInstallerPoll() {
    installerPollOnComplete = null;
    if (installerPollTimer) {
      clearInterval(installerPollTimer);
      installerPollTimer = null;
    }
    installerPollSlug = null;
  }

  function completeInstallerPoll(slug, result) {
    if (slug && installerPollSlug && installerPollSlug !== slug) return false;
    const cb = installerPollOnComplete;
    stopInstallerPoll();
    if (cb) {
      cb(null, result);
      return true;
    }
    return false;
  }

  function startInstallerPoll(slug, onComplete) {
    stopInstallerPoll();
    installerPollSlug = slug;
    installerPollOnComplete = onComplete;
  }

  // Simulate game 1 running installer poll:
  let resolvedResult = null;
  const pollPromise = new Promise((resolve, reject) => {
    startInstallerPoll("game-1", (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });

  // User finished installer, focus event calls markInstalled:
  completeInstallerPoll("game-1", { status: "installed", exe: "C:\\Games\\game1.exe" });

  resolvedResult = await pollPromise;
  assert.deepEqual(resolvedResult, { status: "installed", exe: "C:\\Games\\game1.exe" });
  assert.equal(installerPollOnComplete, null);
  assert.equal(installerPollSlug, null);
});
