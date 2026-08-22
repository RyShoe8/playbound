/**
 * Smoke test for couch protocol helpers (no Electron).
 */

"use strict";

const assert = require("assert");
const { parseInputPacketV1, BUTTON, emptyPadState } = require("./protocol");

const p = parseInputPacketV1({
  v: 1,
  seq: 1,
  t: 1,
  p: 0,
  buttons: BUTTON.A,
  lx: 0.5,
  ly: -0.5,
  rx: 0,
  ry: 0,
  lt: 0,
  rt: 1,
});
assert.ok(p);
assert.strictEqual(p.buttons & BUTTON.A, BUTTON.A);
assert.strictEqual(emptyPadState(2).p, 2);

console.log("couch protocol ok");
