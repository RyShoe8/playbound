/**
 * Physical pad frame → Game Action edge detection, with optional
 * context/layer resolution.
 *
 * This is the missing seam between the launcher's two existing controller
 * vocabularies: `couch/protocol.js`'s physical `BUTTON` bitmask (what the pad
 * actually reports) and a `ControlProfile`'s abstract action ids ("interact",
 * not "E"). `applyControllerConfig` in main.js never bridged these — it just
 * picked one hardcoded layout per pad family. This module is the real
 * translation, driven by a `ControlProfile.bindings` list instead.
 */

"use strict";

const { BUTTON } = require("../couch/protocol");

/**
 * Which binding list is active for a frame: the first context whose trigger
 * button is currently held, else the profile's base bindings. Contexts are
 * checked in array order, so a profile with two simultaneously-holdable
 * triggers should put the more specific one first.
 */
function resolveActiveBindings(frame, profile) {
  const buttons = Number(frame?.buttons) >>> 0;
  for (const ctx of profile.contexts || []) {
    const triggerBit = BUTTON[ctx.trigger];
    if (triggerBit && (buttons & triggerBit) !== 0) {
      return ctx.bindings || [];
    }
  }
  return profile.bindings || [];
}

const AXIS_THRESHOLD = 0.45;
function inputHeld(frame, input) {
  const buttons = Number(frame?.buttons) >>> 0;
  if (BUTTON[input]) return (buttons & BUTTON[input]) !== 0;
  switch (input) {
    case "LEFT_UP": return Number(frame?.ly) < -AXIS_THRESHOLD;
    case "LEFT_DOWN": return Number(frame?.ly) > AXIS_THRESHOLD;
    case "LEFT_LEFT": return Number(frame?.lx) < -AXIS_THRESHOLD;
    case "LEFT_RIGHT": return Number(frame?.lx) > AXIS_THRESHOLD;
    case "LT": return Number(frame?.lt) > AXIS_THRESHOLD;
    case "RT": return Number(frame?.rt) > AXIS_THRESHOLD;
    default: return false;
  }
}

function activeActions(frame, profile) {
  const active = new Set();
  for (const binding of resolveActiveBindings(frame, profile)) {
    if (inputHeld(frame, binding.physicalInput)) active.add(binding.actionId);
  }
  return active;
}

/**
 * Diff the previous and current physical frame against a profile's currently
 * active bindings, returning which action ids just went down/up this frame.
 *
 * Buttons, left-stick directions and analog triggers become held actions.
 * Right-stick → mouse motion remains continuous in `responseCurve.js`.
 *
 * `prevFrame` may be `null` on the first call after activation; every button
 * held in the very first frame is then reported as freshly "down" rather
 * than silently missed.
 */
function diffActionEvents(prevFrame, frame, profile) {
  const previous = activeActions(prevFrame, profile);
  const current = activeActions(frame, profile);
  return {
    down: [...current].filter((id) => !previous.has(id)),
    up: [...previous].filter((id) => !current.has(id)),
  };
}

module.exports = { resolveActiveBindings, diffActionEvents, inputHeld };
