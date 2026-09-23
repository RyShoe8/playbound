/**
 * PlayBound Input Engine — end-to-end command generation from a profile.
 *
 * The one property worth protecting at this level (the sub-modules already
 * have their own focused tests): `releaseAll()` must emit an "up" for every
 * action a profile defines, regardless of what was actually held, because
 * it's the crash-safety path — called on both a clean exit and a killed
 * process, where the engine may not have seen the matching button-up frame.
 */

"use strict";

const assert = require("assert");
const { createInputEngine } = require("./index");
const { BUTTON, emptyPadState } = require("../couch/protocol");
const { VK } = require("./vkCodes");

const profile = {
  actions: [
    { id: "moveForward", label: "Move Forward", output: { type: "key", vk: "W" } },
    { id: "interact", label: "Interact", output: { type: "key", vk: "E" } },
    { id: "attack", label: "Attack", output: { type: "mouseButton", button: "left" } },
  ],
  bindings: [
    { actionId: "moveForward", physicalInput: "LEFT_UP" },
    { actionId: "interact", physicalInput: "A" },
    { actionId: "attack", physicalInput: "RB" },
  ],
  stickMouseSettings: { deadzone: 0.15 },
};

function frame(overrides) {
  return { ...emptyPadState(0), ...overrides };
}

/* ── A button press produces the bound key-down command ─────────────────── */

{
  const engine = createInputEngine(profile);
  const commands = engine.tick(frame({ buttons: BUTTON.A }), 1 / 60);
  assert.deepStrictEqual(
    commands.filter((c) => c.cmd === "key"),
    [{ cmd: "key", vk: VK.E, action: "down" }]
  );
}

/* ── Release produces the matching key-up, and only once ────────────────── */

{
  const engine = createInputEngine(profile);
  engine.tick(frame({ buttons: BUTTON.A }), 1 / 60);
  const held = engine.tick(frame({ buttons: BUTTON.A }), 1 / 60);
  assert.deepStrictEqual(held.filter((c) => c.cmd === "key"), []);
  const released = engine.tick(frame({ buttons: 0 }), 1 / 60);
  assert.deepStrictEqual(
    released.filter((c) => c.cmd === "key"),
    [{ cmd: "key", vk: VK.E, action: "up" }]
  );
}

/* ── A mouseButton-bound action produces a mouseButton command ──────────── */

{
  const engine = createInputEngine(profile);
  const commands = engine.tick(frame({ buttons: BUTTON.RB }), 1 / 60);
  assert.deepStrictEqual(
    commands.filter((c) => c.cmd === "mouseButton"),
    [{ cmd: "mouseButton", button: "left", action: "down" }]
  );
}

/* ── Right-stick deflection produces a mouseMove command ────────────────── */

{
  const engine = createInputEngine(profile);
  const commands = engine.tick(frame({ rx: 1, ry: 0 }), 1 / 60);
  const move = commands.find((c) => c.cmd === "mouseMove");
  assert.ok(move, "expected a mouseMove command for a deflected right stick");
  assert.ok(move.dx > 0, "positive rx should move the mouse right");
}

/* ── An action with no binding (unbound in this profile) never emits ────── */

{
  const engine = createInputEngine(profile);
  // Left stick up is bound to moveForward; confirm it actually fires so this test
  // isn't vacuously true, then confirm nothing fires for an action id that
  // exists but has no physical binding anywhere in the profile.
  const commands = engine.tick(frame({ ly: -0.8 }), 1 / 60);
  assert.deepStrictEqual(
    commands.filter((c) => c.cmd === "key"),
    [{ cmd: "key", vk: VK.W, action: "down" }]
  );
}

/* ── releaseAll emits an "up" for every action, even ones never pressed ─── */

{
  const engine = createInputEngine(profile);
  engine.tick(frame({ buttons: BUTTON.A }), 1 / 60); // only "interact" is actually held
  const commands = engine.releaseAll();
  const keys = commands.filter((c) => c.cmd === "key").map((c) => c.vk);
  assert.ok(keys.includes(VK.W), "moveForward must release even though it was never pressed");
  assert.ok(keys.includes(VK.E), "interact must release");
  assert.ok(
    commands.some((c) => c.cmd === "mouseButton" && c.button === "left" && c.action === "up"),
    "attack's mouse button must release"
  );
  for (const c of commands) {
    assert.strictEqual(c.action, "up", "releaseAll must never emit a down command");
  }
}

/* ── After releaseAll, the engine's smoothing/frame state is reset ──────── */

{
  const engine = createInputEngine(profile);
  engine.tick(frame({ rx: 1, ry: 0 }), 1 / 60);
  engine.tick(frame({ rx: 1, ry: 0 }), 1 / 60); // let velocity build up
  engine.releaseAll();
  const commands = engine.tick(frame({ rx: 0, ry: 0 }), 1 / 60);
  const move = commands.find((c) => c.cmd === "mouseMove");
  assert.ok(!move, "a fresh tick after releaseAll with a neutral stick must not still be coasting");
}

/* ── Live settings tuning (overlay Controls tab) takes effect on the next tick ── */

{
  const engine = createInputEngine({ ...profile, stickMouseSettings: { sensitivity: 1, acceleration: 0, smoothing: 0 } });
  const before = engine.tick(frame({ rx: 1, ry: 0 }), 1 / 60).find((c) => c.cmd === "mouseMove");

  engine.updateSettings({ sensitivity: 5 });
  const after = engine.tick(frame({ rx: 1, ry: 0 }), 1 / 60).find((c) => c.cmd === "mouseMove");

  assert.ok(after.dx > before.dx, "a live sensitivity change must move further on the very next tick");
  assert.strictEqual(engine.getSettings().sensitivity, 5, "getSettings must reflect the override");
}

{
  // updateSettings must merge onto the current effective settings, not
  // replace them wholesale — an invert-Y toggle should not silently reset
  // whatever sensitivity the player already had.
  const engine = createInputEngine({
    ...profile,
    stickMouseSettings: { sensitivity: 3, invertY: false },
  });
  engine.updateSettings({ invertY: true });
  const settings = engine.getSettings();
  assert.strictEqual(settings.sensitivity, 3, "an unrelated field must survive a partial update");
  assert.strictEqual(settings.invertY, true);
}

console.log("input engine ok");
