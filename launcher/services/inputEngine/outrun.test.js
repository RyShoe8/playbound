"use strict";

const assert = require("assert");
const profile = require("./profiles/outrun.json");
const { createInputEngine } = require("./index");
const { VK } = require("./vkCodes");
const { BUTTON, emptyPadState } = require("../couch/protocol");

function frame(overrides = {}) {
  return { ...emptyPadState(0), ...overrides };
}

const engine = createInputEngine(profile);
const driving = engine.tick(frame({ lx: -1, rt: 1, buttons: BUTTON.RB, rx: 1 }), 1 / 60);
assert.deepStrictEqual(driving, [
  { cmd: "key", vk: VK.ArrowLeft, action: "down" },
  { cmd: "key", vk: VK.LeftCtrl, action: "down" },
  { cmd: "key", vk: VK.Z, action: "down" },
]);
assert.deepStrictEqual(engine.tick(frame({ lx: -1, rt: 1, buttons: BUTTON.RB }), 1 / 60), []);
assert.deepStrictEqual(engine.tick(frame(), 1 / 60), [
  { cmd: "key", vk: VK.ArrowLeft, action: "up" },
  { cmd: "key", vk: VK.LeftCtrl, action: "up" },
  { cmd: "key", vk: VK.Z, action: "up" },
]);
assert.deepStrictEqual(engine.tick(frame({ lx: 1, lt: 1, buttons: BUTTON.LB }), 1 / 60), [
  { cmd: "key", vk: VK.ArrowRight, action: "down" },
  { cmd: "key", vk: VK.LeftAlt, action: "down" },
  { cmd: "key", vk: VK.RightCtrl, action: "down" },
]);
assert.ok(engine.releaseAll().every((command) => command.action === "up"));
console.log("OutRun pilot profile ok");
