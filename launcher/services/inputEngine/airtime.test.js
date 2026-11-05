"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createInputEngine } = require("./index");
const profile = require("./profiles/airtime.json");

test("Airtime steering and throttle release without idle key or mouse drift", () => {
  const engine = createInputEngine(profile);
  const idle = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
  assert.deepEqual(engine.tick(idle, 1 / 60), []);
  assert.deepEqual(engine.tick({ ...idle, lx: -1, rt: 1 }, 1 / 60), [
    { cmd: "key", vk: 0x25, action: "down" },
    { cmd: "key", vk: 0x26, action: "down" },
  ]);
  assert.deepEqual(engine.tick(idle, 1 / 60), [
    { cmd: "key", vk: 0x25, action: "up" },
    { cmd: "key", vk: 0x26, action: "up" },
  ]);
  assert.deepEqual(engine.tick(idle, 1 / 60), []);
});
