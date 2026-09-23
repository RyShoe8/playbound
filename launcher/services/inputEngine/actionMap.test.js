/**
 * Physical frame → Game Action edge detection and context/layer resolution.
 *
 * This is the seam `applyControllerConfig` in main.js never actually built —
 * see the module docstring in actionMap.js. These checks protect the two
 * things that matter for correctness here: an action fires exactly once per
 * physical press/release (not once per frame it's held), and holding a
 * context trigger swaps the whole active binding set.
 */

"use strict";

const assert = require("assert");
const { resolveActiveBindings, diffActionEvents } = require("./actionMap");
const { BUTTON, emptyPadState } = require("../couch/protocol");

const profile = {
  bindings: [
    { actionId: "interact", physicalInput: "A" },
    { actionId: "back", physicalInput: "B" },
  ],
  contexts: [
    {
      name: "menu",
      trigger: "LB",
      bindings: [{ actionId: "quickSave", physicalInput: "A" }],
    },
  ],
};

function frameWithButtons(mask) {
  return { ...emptyPadState(0), buttons: mask };
}

/* ── Base bindings resolve when no context trigger is held ──────────────── */

assert.deepStrictEqual(resolveActiveBindings(frameWithButtons(0), profile), profile.bindings);

/* ── Holding the context trigger swaps to that context's bindings ───────── */

assert.deepStrictEqual(
  resolveActiveBindings(frameWithButtons(BUTTON.LB), profile),
  profile.contexts[0].bindings
);

/* ── An unbound button (no trigger match) falls back to base bindings ───── */

assert.deepStrictEqual(resolveActiveBindings(frameWithButtons(BUTTON.X), profile), profile.bindings);

/* ── diffActionEvents: fires once on press, once on release, not per-frame ── */

{
  const f0 = frameWithButtons(0);
  const f1 = frameWithButtons(BUTTON.A);
  const first = diffActionEvents(null, f1, profile);
  assert.deepStrictEqual(first.down, ["interact"]);
  assert.deepStrictEqual(first.up, []);

  // Held across a second frame: nothing new fires.
  const held = diffActionEvents(f1, f1, profile);
  assert.deepStrictEqual(held.down, []);
  assert.deepStrictEqual(held.up, []);

  // Released: fires exactly once.
  const released = diffActionEvents(f1, f0, profile);
  assert.deepStrictEqual(released.down, []);
  assert.deepStrictEqual(released.up, ["interact"]);
}

/* ── A null prevFrame (first tick after activation) still detects presses ── */

{
  const result = diffActionEvents(null, frameWithButtons(BUTTON.A | BUTTON.B), profile);
  assert.deepStrictEqual(result.down.sort(), ["back", "interact"]);
}

/* ── Switching context mid-hold resolves against the NEW active bindings ─── */

{
  // A is held while LB is also pressed: this frame's active binding is the
  // menu context, so the diff must be evaluated against quickSave, not
  // interact, even though A was already down before LB was pressed.
  const aOnly = frameWithButtons(BUTTON.A);
  const aPlusLB = frameWithButtons(BUTTON.A | BUTTON.LB);
  const result = diffActionEvents(aOnly, aPlusLB, profile);
  // The old action must be released and the context action pressed, even
  // though A itself stayed down throughout the transition.
  assert.deepStrictEqual(result.down, ["quickSave"]);
  assert.deepStrictEqual(result.up, ["interact"]);
}

/* ── Directional stick and analog trigger bindings are held actions ─────── */

{
  const withAxes = {
    bindings: [
      { actionId: "forward", physicalInput: "LEFT_UP" },
      { actionId: "attack", physicalInput: "RT" },
    ],
  };
  const held = { ...frameWithButtons(0), ly: -0.8, rt: 0.9 };
  assert.deepStrictEqual(diffActionEvents(null, held, withAxes).down, ["forward", "attack"]);
  assert.deepStrictEqual(diffActionEvents(held, held, withAxes), { down: [], up: [] });
  assert.deepStrictEqual(diffActionEvents(held, frameWithButtons(0), withAxes).up, ["forward", "attack"]);
}

console.log("action map ok");
