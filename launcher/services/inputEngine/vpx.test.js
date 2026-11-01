"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createInputEngine } = require("./index");
const profile = require("./profiles/visual-pinball-x.json");

test("VPX triggers synthesize separate left and right flipper keys", () => {
  const engine = createInputEngine(profile);
  const idle = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
  assert.deepEqual(engine.tick(idle, 1 / 60), []);
  assert.deepEqual(engine.tick({ ...idle, lt: 1 }, 1 / 60), [{ cmd: "key", vk: 0xa0, action: "down" }]);
  assert.deepEqual(engine.tick({ ...idle, lt: 1, rt: 1 }, 1 / 60), [{ cmd: "key", vk: 0xa1, action: "down" }]);
  assert.deepEqual(engine.tick(idle, 1 / 60), [
    { cmd: "key", vk: 0xa0, action: "up" },
    { cmd: "key", vk: 0xa1, action: "up" },
  ]);
});
