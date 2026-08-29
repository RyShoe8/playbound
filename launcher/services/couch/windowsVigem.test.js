/**
 * Dedupe key for the Windows ViGEm host (no Electron, no driver).
 *
 * applyState skips writing a frame whose quantized report matches the last one
 * sent, because the host is a serial PowerShell loop where one update measured
 * ~1.7ms and a phone streams 60Hz whether or not anything moved.
 *
 * The risk that buys is a dropped input: if this quantization disagrees with
 * the host's, a frame the pad would have rendered differently gets skipped and
 * never arrives. So these check the two boundaries where they could drift —
 * clamping and rounding — against the arithmetic in PlayBound.VigemHost.ps1.
 */

"use strict";

const assert = require("assert");
const { toShort, toByte, reportKey } = require("./windowsVigem");
const { emptyPadState } = require("./protocol");

/* ── Conversion matches the host ──────────────────────────────────────── */

assert.strictEqual(toShort(0), 0);
assert.strictEqual(toShort(1), 32767);
assert.strictEqual(toShort(-1), -32767);
// Clamped, not wrapped — an out-of-range axis must not flip sign.
assert.strictEqual(toShort(5), 32767);
assert.strictEqual(toShort(-5), -32767);
assert.strictEqual(toByte(0), 0);
assert.strictEqual(toByte(1), 255);
assert.strictEqual(toByte(2), 255);
assert.strictEqual(toByte(-1), 0);

// Garbage must land on a defined value rather than NaN, which would poison the
// key and make every subsequent frame compare unequal.
for (const bad of [NaN, Infinity, -Infinity, undefined, null, "x", {}]) {
  assert.strictEqual(Number.isFinite(toShort(bad)), true, `toShort(${String(bad)})`);
  assert.strictEqual(Number.isFinite(toByte(bad)), true, `toByte(${String(bad)})`);
}

// Ties round up, matching Floor(x + 0.5) in the host rather than PowerShell's
// default banker's rounding. 0.5/255 is an exact midpoint for the trigger.
assert.strictEqual(toByte(0.5 / 255), 1);

/* ── The key changes when, and only when, the pad would see a change ──── */

const base = emptyPadState(0);
assert.strictEqual(reportKey(base), reportKey(emptyPadState(0)), "identical states match");

// Slot is deliberately not part of the key: it is tracked per slot already.
assert.strictEqual(reportKey(emptyPadState(0)), reportKey(emptyPadState(3)));

for (const [field, value] of [
  ["buttons", 1],
  ["lx", 1],
  ["ly", 1],
  ["rx", 1],
  ["ry", 1],
  ["lt", 1],
  ["rt", 1],
]) {
  const changed = { ...base, [field]: value };
  assert.notStrictEqual(reportKey(changed), reportKey(base), `${field} must change the key`);
}

// Every button bit must be distinguishable; a mask collision would silently
// swallow one button forever.
const seen = new Set();
for (let bit = 0; bit < 15; bit++) {
  const key = reportKey({ ...base, buttons: 1 << bit });
  assert.strictEqual(seen.has(key), false, `button bit ${bit} collides`);
  seen.add(key);
}

// Sub-LSB movement is genuinely invisible to the pad, so it should dedupe.
const jitter = { ...base, lx: 1 / 200000 };
assert.strictEqual(reportKey(jitter), reportKey(base), "sub-LSB jitter dedupes");

// One full step must not.
const oneStep = { ...base, lx: 1 / 32767 };
assert.notStrictEqual(reportKey(oneStep), reportKey(base), "a full step must send");

// The Y axes are inverted by the host; the key must follow it so that up and
// down are not treated as the same report.
assert.notStrictEqual(
  reportKey({ ...base, ly: 0.5 }),
  reportKey({ ...base, ly: -0.5 }),
  "opposite ly must differ"
);

console.log("windows vigem dedupe ok");
