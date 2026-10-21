const assert = require("node:assert/strict");
const test = require("node:test");

const MAIN = require("./testing-mainSource").readMainSource();

/** The body of one top-level function, brace-matched. */
function functionBody(name) {
  const start = MAIN.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `no function ${name}`);
  let i = MAIN.indexOf("{", start);
  let depth = 0;
  for (; i < MAIN.length; i += 1) {
    if (MAIN[i] === "{") depth += 1;
    else if (MAIN[i] === "}" && --depth === 0) break;
  }
  return MAIN.slice(start, i + 1);
}

test("cancelling a row whose task is already gone clears it instead of failing", () => {
  const body = functionBody("cancelInstallQueueItem");
  assert.doesNotMatch(body, /return \{ ok: false, error: "Install not found in queue" \}/);
  assert.match(body, /alreadyGone: true/);
  // It must resend the real queue so the window drops the stale row.
  assert.match(body, /broadcastInstallQueue\(\)[\s\S]*alreadyGone: true/);
  assert.match(body, /stopExeScan\(slug\)/);
});

test("Daggerfall editions that bring no game files go through the base-game offer", () => {
  const body = functionBody("installGame");
  assert.match(body, /offerDaggerfallBaseFirst\(slug, editionSlug\)/);
  // Declining the pre-queue offer must clear a renderer status already saying
  // "Installing…"; no queued task exists to emit its usual terminal event.
  assert.match(body, /getInstallQueueSnapshot\(\)\.totalCount === 0\)\s*\{\s*sendProgress\(\{ phase: "cancelled"/);
  const offer = functionBody("offerDaggerfallBaseFirst");
  assert.match(offer, /installGame\(slug, null, daggerfallBaseFirst\.BASE_EDITION\)/);
  assert.match(offer, /requestDaggerfallBaseChoice\(name\)/);
  assert.doesNotMatch(offer, /dialog\.showMessageBox/);
});
