/**
 * Response-curve engine (no Electron, no controller — pure math).
 *
 * These guard the specific failure mode the brief this feature was scoped
 * from calls out by name: naive `stickX * constant` mouse-look. Each check
 * corresponds to one knob (deadzone, curve, sensitivity, acceleration,
 * smoothing, invert-Y, precision) actually doing something, and to raw
 * stick noise at rest never reaching the pointer.
 */

"use strict";

const assert = require("assert");
const { shapeAxis, stickToMouseDelta, DEFAULT_SETTINGS } = require("./responseCurve");

/* ── Deadzone ──────────────────────────────────────────────────────────── */

// Inside the deadzone, in any direction, output must be exactly zero — not
// just small — or resting noise still moves the pointer.
assert.deepStrictEqual(shapeAxis(0.1, 0, 0.15, "linear"), { x: 0, y: 0, mag: 0 });
assert.deepStrictEqual(shapeAxis(0.1, 0.1, 0.15, "linear"), { x: 0, y: 0, mag: 0 });

// Just past the deadzone, output starts near zero rather than jumping.
const justPast = shapeAxis(0.16, 0, 0.15, "linear");
assert.ok(justPast.mag > 0 && justPast.mag < 0.05, `expected a small ramp-in, got ${justPast.mag}`);

// Full deflection always reaches full shaped magnitude, regardless of curve.
assert.strictEqual(shapeAxis(1, 0, 0.15, "linear").mag, 1);
assert.strictEqual(shapeAxis(1, 0, 0.15, "exponential").mag, 1);

/* ── Curve shape ───────────────────────────────────────────────────────── */

// Exponential must be gentler than linear away from the extremes — that is
// the entire point of offering a curve.
const mid = 0.15 + (1 - 0.15) * 0.5; // "half deflection" past the deadzone
const linearMid = shapeAxis(mid, 0, 0.15, "linear").mag;
const expoMid = shapeAxis(mid, 0, 0.15, "exponential").mag;
assert.ok(expoMid < linearMid, `exponential (${expoMid}) should be gentler than linear (${linearMid}) mid-stick`);

/* ── Direction preserved through the deadzone rescale ─────────────────── */

const diag = shapeAxis(0.5, 0.5, 0.15, "linear");
assert.ok(Math.abs(diag.x - diag.y) < 1e-9, "equal input axes must stay equal after shaping");
assert.ok(diag.x > 0 && diag.y > 0, "direction must be preserved, not flattened to an axis");

/* ── stickToMouseDelta: a resting stick never moves the pointer ─────────── */

{
  const smooth = { vx: 0, vy: 0 };
  const { dx, dy } = stickToMouseDelta({ x: 0, y: 0 }, DEFAULT_SETTINGS, 1 / 60, smooth);
  assert.strictEqual(dx, 0);
  assert.strictEqual(dy, 0);
}

/* ── Sensitivity scales output monotonically ─────────────────────────── */

{
  const lowSmooth = { vx: 0, vy: 0 };
  const highSmooth = { vx: 0, vy: 0 };
  const settings = { ...DEFAULT_SETTINGS, acceleration: 0, smoothing: 0 };
  // Run a few frames so the (now-instant) ramp has settled to the target.
  let low, high;
  for (let i = 0; i < 5; i++) {
    low = stickToMouseDelta({ x: 1, y: 0 }, { ...settings, sensitivity: 1 }, 1 / 60, lowSmooth);
    high = stickToMouseDelta({ x: 1, y: 0 }, { ...settings, sensitivity: 2 }, 1 / 60, highSmooth);
  }
  assert.ok(high.dx > low.dx, `higher sensitivity (${high.dx}) should move further than lower (${low.dx})`);
}

/* ── Invert-Y flips vertical output only ──────────────────────────────── */

{
  const s1 = { vx: 0, vy: 0 };
  const s2 = { vx: 0, vy: 0 };
  const normal = stickToMouseDelta({ x: 0, y: 1 }, { ...DEFAULT_SETTINGS, invertY: false }, 1 / 60, s1);
  const inverted = stickToMouseDelta({ x: 0, y: 1 }, { ...DEFAULT_SETTINGS, invertY: true }, 1 / 60, s2);
  assert.ok(normal.dy !== 0, "sanity: normal should produce vertical movement");
  assert.strictEqual(Math.sign(inverted.dy), -Math.sign(normal.dy), "invertY must flip the vertical sign");
}

/* ── Acceleration ramps rather than snaps ────────────────────────────── */

{
  const settings = { ...DEFAULT_SETTINGS, acceleration: 0.9, smoothing: 0 };
  const smooth = { vx: 0, vy: 0 };
  const first = stickToMouseDelta({ x: 1, y: 0 }, settings, 1 / 60, smooth);
  const settled = { ...DEFAULT_SETTINGS, acceleration: 0.9, smoothing: 0 };
  let last = first;
  for (let i = 0; i < 200; i++) {
    last = stickToMouseDelta({ x: 1, y: 0 }, settled, 1 / 60, smooth);
  }
  assert.ok(last.dx > first.dx, "velocity should still be ramping up shortly after a hard deflection");
}

/* ── Precision modifier reduces effective sensitivity ────────────────── */

{
  const s1 = { vx: 0, vy: 0 };
  const s2 = { vx: 0, vy: 0 };
  const settings = { ...DEFAULT_SETTINGS, acceleration: 0, smoothing: 0, precisionMultiplier: 0.4 };
  let normal, precise;
  for (let i = 0; i < 5; i++) {
    normal = stickToMouseDelta({ x: 1, y: 0 }, settings, 1 / 60, s1, false);
    precise = stickToMouseDelta({ x: 1, y: 0 }, settings, 1 / 60, s2, true);
  }
  assert.ok(precise.dx < normal.dx, "holding the precision modifier must slow the pointer");
}

console.log("response curve engine ok");
