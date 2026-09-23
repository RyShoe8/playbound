/**
 * Right-stick → mouse response-curve engine.
 *
 * The brief this feature is built from is explicit that naive
 * `stickX * constant` mouse-look feels wrong. This applies a radial deadzone,
 * a configurable response curve, acceleration ramping and smoothing, and an
 * invert-Y flag — the same knobs `ControlProfile.stickMouseSettings` exposes
 * for editorial tuning per game, and the overlay's Controls tab for a
 * per-player override on top of that.
 *
 * Pure functions plus one small mutable smoothing state the caller owns
 * (one per active game session) — no Electron/IPC/timers in here, so this is
 * unit-testable without a controller or a running launcher.
 */

"use strict";

const DEFAULT_SETTINGS = Object.freeze({
  deadzone: 0.15,
  curve: "exponential", // "linear" | "exponential"
  sensitivity: 1.35,
  acceleration: 0.35, // 0 = snap instantly to target velocity, closer to 1 = slower ramp
  smoothing: 0.08, // 0 = no smoothing, closer to 1 = heavier low-pass filtering
  maxVelocity: 900, // px/sec at full deflection, before sensitivity is applied
  invertY: false,
  precisionMultiplier: 0.4, // applied to sensitivity while a "precision" action is held
});

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Radial deadzone + response curve, applied to the stick's magnitude while
 * preserving its direction — so a stick pushed diagonally doesn't get a
 * smaller effective deadzone than one pushed on a single axis.
 *
 * Output is rescaled so it starts at 0 just past the deadzone edge rather
 * than jumping straight to whatever the curve produces there.
 */
function shapeAxis(x, y, deadzone, curve) {
  const mag = Math.min(1, Math.hypot(x, y));
  if (mag <= deadzone) return { x: 0, y: 0, mag: 0 };
  const scaled = (mag - deadzone) / (1 - deadzone);
  const shaped = curve === "exponential" ? scaled * scaled : scaled;
  return { x: (x / mag) * shaped, y: (y / mag) * shaped, mag: shaped };
}

/**
 * Convert one frame of right-stick axis input into a mouse-delta for this
 * frame.
 *
 * @param {{x:number, y:number}} raw stick axes in [-1, 1]
 * @param {object} settings merged over DEFAULT_SETTINGS
 * @param {number} dtSeconds time since the previous call
 * @param {{vx:number, vy:number}} smoothState mutated in place; create fresh
 *   (`{ vx: 0, vy: 0 }`) per activation and discard on deactivate
 * @param {boolean} [precisionActive] true while the profile's precision
 *   modifier action is held
 * @returns {{dx:number, dy:number}}
 */
function stickToMouseDelta(raw, settings, dtSeconds, smoothState, precisionActive = false) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const shaped = shapeAxis(clamp(raw.x || 0, -1, 1), clamp(raw.y || 0, -1, 1), s.deadzone, s.curve);
  const invert = s.invertY ? -1 : 1;
  const sensitivity = s.sensitivity * (precisionActive ? s.precisionMultiplier : 1);

  const targetVx = shaped.x * sensitivity * s.maxVelocity;
  const targetVy = shaped.y * invert * sensitivity * s.maxVelocity;

  // Acceleration ramps the target velocity in rather than snapping to it;
  // smoothing then low-pass filters the ramped value so per-poll jitter at
  // rest never reaches the pointer.
  const rampAlpha = clamp(1 - s.acceleration, 0.05, 1);
  const rampedVx = smoothState.vx + (targetVx - smoothState.vx) * rampAlpha;
  const rampedVy = smoothState.vy + (targetVy - smoothState.vy) * rampAlpha;

  const smoothAlpha = clamp(1 - s.smoothing, 0.05, 1);
  smoothState.vx += (rampedVx - smoothState.vx) * smoothAlpha;
  smoothState.vy += (rampedVy - smoothState.vy) * smoothAlpha;

  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
  return { dx: smoothState.vx * dt, dy: smoothState.vy * dt };
}

module.exports = { DEFAULT_SETTINGS, shapeAxis, stickToMouseDelta, clamp };
