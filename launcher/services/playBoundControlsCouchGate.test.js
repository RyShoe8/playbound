/**
 * The couch/phone gate on PlayBound Controls activation.
 *
 * A real multiplayer couch party must always disqualify PlayBound Controls —
 * one PC has one keyboard/mouse, so it can never sensibly serve more than
 * one player. A solo phone-controller session (minted only to plumb one
 * phone's transport for single-player, never by the real couch-party UI)
 * must not. These read main.js rather than reimplementing it, so the
 * assertions are about the code that actually runs — the same discipline
 * detectionTrust.test.js uses for the same reason.
 *
 * Run: node services/playBoundControlsCouchGate.test.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function functionBody(signature) {
  const start = src.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found in main.js`);
  // The signature line itself may contain its own balanced braces (e.g. a
  // `opts = {}` default parameter) before the body's opening brace — the
  // body always starts at the LAST brace on the signature's own line.
  const lineEnd = src.indexOf("\n", start);
  const bodyStart = src.lastIndexOf("{", lineEnd);
  let i = bodyStart;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

const gateBody = functionBody("function couchDisqualifiesPlayBoundControls(");

// The actual disqualifying rule: active AND not solo.
assert.match(gateBody, /state\?\.active/);
assert.match(gateBody, /session\?\.solo\s*!==\s*true/);

// Both real call sites must route through the shared gate rather than
// re-deriving their own couch/phone exclusion — that duplication is exactly
// how the previous "always excludes inputMode === 'phone'" bug happened.
const availableBody = functionBody("async function availablePlayBoundControlsProfile(");
assert.match(availableBody, /couchDisqualifiesPlayBoundControls\(\)/);
assert.doesNotMatch(
  availableBody,
  /couchHost\?\.getState\?\.\(\)\?\.active(?!.*couchDisqualifiesPlayBoundControls)/,
  "must not re-derive its own couch-active check instead of the shared gate"
);

const applyBody = functionBody("async function applyControllerConfig(");
assert.match(applyBody, /couchDisqualifiesPlayBoundControls\(\)/);
// The old bug: phone was excluded unconditionally, regardless of solo status.
assert.doesNotMatch(
  applyBody,
  /inputMode !== "phone"/,
  "phone must not be unconditionally excluded — a solo phone session should be allowed through the shared gate"
);

console.log("PlayBound Controls couch gate ok");
