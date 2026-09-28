"use strict";

const assert = require("assert");
const profile = require("./profiles/holocure.json");
const { createInputEngine } = require("./index");
const { BUTTON, emptyPadState } = require("../couch/protocol");

function frame(overrides = {}) {
  return { ...emptyPadState(0), ...overrides };
}

// The multiplayer mod's menus answer only the mouse: R3 must click and the
// right stick must move the cursor, without touching anything HoloCure's
// native pad support already uses.
const engine = createInputEngine(JSON.parse(JSON.stringify(profile)));

assert.deepStrictEqual(engine.tick(frame({ buttons: BUTTON.RS }), 1 / 60), [
  { cmd: "mouseButton", button: "left", action: "down" },
]);
assert.deepStrictEqual(engine.tick(frame(), 1 / 60), [
  { cmd: "mouseButton", button: "left", action: "up" },
]);

let moved = false;
for (let i = 0; i < 30 && !moved; i += 1) {
  moved = engine.tick(frame({ rx: 1 }), 1 / 60).some((c) => c.cmd === "mouseMove" && c.dx > 0);
}
assert.ok(moved, "right stick moves the cursor");

// Face buttons, shoulders and the left stick stay native: no synthetic output.
for (const button of ["A", "B", "X", "Y", "LB", "RB", "START", "BACK"]) {
  assert.deepStrictEqual(createInputEngine(JSON.parse(JSON.stringify(profile))).tick(frame({ buttons: BUTTON[button] }), 1 / 60), [], button);
}
assert.deepStrictEqual(createInputEngine(JSON.parse(JSON.stringify(profile))).tick(frame({ lx: -1, ly: 1 }), 1 / 60), []);

console.log("holocure controls tests passed");
