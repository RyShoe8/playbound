"use strict";

const assert = require("node:assert/strict");
const profile = require("./profiles/grid-leader.json");
const { createInputEngine } = require("./index");
const { VK } = require("./vkCodes");
const { BUTTON, emptyPadState } = require("../couch/protocol");

const engine = createInputEngine(profile);
const driving = engine.tick({ ...emptyPadState(0), lx: -1, rt: 1, buttons: BUTTON.A }, 1 / 60);
assert.deepEqual(driving, [
  { cmd: "key", vk: VK.ArrowLeft, action: "down" },
  { cmd: "key", vk: VK.ArrowUp, action: "down" },
  { cmd: "key", vk: VK.Space, action: "down" },
]);
assert.deepEqual(engine.tick({ ...emptyPadState(0), buttons: BUTTON.START }, 1 / 60), [
  { cmd: "key", vk: VK.P, action: "down" },
  { cmd: "key", vk: VK.ArrowLeft, action: "up" },
  { cmd: "key", vk: VK.ArrowUp, action: "up" },
  { cmd: "key", vk: VK.Space, action: "up" },
]);
assert.ok(!profile.actions.some(({ output }) => output.vk === "Escape"));
assert.equal(profile.status, "testing");

console.log("Grid Leader test profile ok");
