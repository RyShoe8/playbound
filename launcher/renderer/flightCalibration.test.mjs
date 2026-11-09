import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCalibratedProfile,
  hatMapFrom,
  hatReading,
  movedAxis,
  pinnedAxes,
  povDirection,
  pressedButton,
} from "./flightCalibration.js";

// A HOTAS 4 at rest, as the Gamepad API reports it: RX (3) pinned at +1, hat (9) centred above 1.
const idle = { axes: [0, 0, -1, 1, 0, 0, 0, 0, 0, 3.28], buttons: Array(14).fill(false) };
const withAxis = (i, v) => ({ ...idle, axes: idle.axes.map((x, j) => (j === i ? v : x)) });

test("a pinned axis is found at rest and never chosen", () => {
  assert.deepEqual(pinnedAxes(idle), [2, 3]);
  const samples = [withAxis(3, -1), withAxis(3, 1), withAxis(0, -1), withAxis(0, 1)];
  assert.equal(movedAxis(samples, { exclude: [3] }), 0);
});

test("the moved axis is the widest swing, and small jitter is ignored", () => {
  assert.equal(movedAxis([withAxis(5, -0.9), withAxis(5, 0.95), withAxis(0, 0.1)]), 5);
  assert.equal(movedAxis([withAxis(1, -0.2), withAxis(1, 0.2)]), null);
  assert.equal(movedAxis([withAxis(0, -1), withAxis(0, 1)], { exclude: [0] }), null);
});

test("a new press is found, and already-assigned buttons are skipped", () => {
  const now = { ...idle, buttons: idle.buttons.map((_, i) => i === 4 || i === 0) };
  assert.equal(pressedButton(idle, now), 0);
  assert.equal(pressedButton(idle, now, { exclude: [0] }), 4);
  assert.equal(pressedButton(idle, idle), null);
});

test("hat pushes decode from the POV axis, including a reversed device", () => {
  assert.equal(povDirection(-1), "up");
  assert.equal(povDirection(-3 / 7), "right");
  assert.equal(povDirection(3.28), null);
  // HOTAS 4: pushing right reports "left".
  assert.deepEqual(hatReading(idle, withAxis(9, 5 / 7)), { index: 9, direction: "left" });
  assert.deepEqual(hatMapFrom("left", "up"), { up: "up", right: "left", down: "down", left: "right" });
  assert.deepEqual(hatMapFrom(undefined, undefined), { up: "up", right: "right", down: "down", left: "left" });
});

test("captured steps build a profile the launcher accepts", async () => {
  const profile = buildCalibratedProfile({
    vidPid: "044f:b67c",
    label: "T.Flight Hotas 4 (Vendor: 044f Product: b67c)",
    idle,
    captured: { stickX: 0, stickY: 1, throttle: 2, twist: 5, rocker: 6, fire: 0, altFire: 1, pause: 11, hatRight: "left", hatUp: "up" },
  });
  assert.equal(profile.label, "T.Flight Hotas 4");
  assert.equal(profile.deviceType, "hotas");
  assert.deepEqual(profile.unusableAxes, [3]);
  assert.equal(profile.roles.fire, "Button 1");
  assert.equal(profile.hat.right, "left");
  const { normalizeProfile } = await import("../services/flightDevices.js");
  const clean = normalizeProfile(profile);
  assert.ok(clean, "normalizeProfile rejected a calibrated profile");
  assert.equal(clean.roles.pause, "Button 12");
});
