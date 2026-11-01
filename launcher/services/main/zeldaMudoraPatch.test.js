"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// gameFixes is an Electron main-process module. Its patch function is pure;
// stub only the runtime dependencies so this can run under Node's test runner.
const originalLoad = Module._load;
let patchZeldaMudoraGameManager;
let patchZeldaMudoraAxisRepeat;
try {
  Module._load = function(request, parent, isMain) {
    if (parent?.filename?.endsWith("gameFixes.js")) {
      if (request === "electron") return { app: {} };
      if (request === "./core" || request === "../daggerfallData") return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  ({ patchZeldaMudoraGameManager, patchZeldaMudoraAxisRepeat } = require("./gameFixes"));
} finally {
  Module._load = originalLoad;
}

test("Zelda save start installs joypad bindings only after the game starts", () => {
  const old = `local game = ...\n\n-- PlayBound Solarus 2 controller repair v3\n` +
    `game:set_command_joypad_binding("action", "a")\n\n-- This script handles global properties\n` +
    `function game_manager.start()\n  game:start()\nend\n`;
  const fixed = patchZeldaMudoraGameManager(old);
  assert.match(fixed, /game:register_event\("on_started", function\(game\)/);
  assert.doesNotMatch(fixed, /controller repair v3/);
  assert.equal((fixed.match(/action = "a"/g) || []).length, 1);
  // Only unbound or Solarus 1 commands are filled, so an in-game remap survives.
  assert.match(fixed, /if current == nil or current == ""/);
  assert.equal(patchZeldaMudoraGameManager(fixed), fixed);
});

test("a v4 install's binding block is replaced, not stacked", () => {
  const v4 = `local game = ...

-- PlayBound Solarus 2 controller repair v4
game:register_event("on_started", function(game)
` +
    `game:set_command_joypad_binding("action", "a")
end)

local pb_active_hat_cmds = {}
function game:on_joypad_hat_moved(hat, direction8)
` +
    `  pb_active_hat_cmds = next_set
  return true
end

-- This script handles global properties
`;
  const fixed = patchZeldaMudoraGameManager(v4);
  assert.doesNotMatch(fixed, /controller repair v4/);
  assert.equal((fixed.match(/function game:on_joypad_hat_moved/g) || []).length, 1);
  assert.match(fixed, /-- This script handles global properties/);
});

test("pause and warp keep a repeat slot per axis, so releasing the stick gets through", () => {
  const original = "local handled = joy_avoid_repeat[axis % 2] == state\njoy_avoid_repeat[axis % 2] = state\n";
  const v4 = "local handled = joy_avoid_repeat[(tonumber(axis) or 0) % 2] == state\njoy_avoid_repeat[(tonumber(axis) or 0) % 2] = state\n";
  const want = "local handled = joy_avoid_repeat[axis] == state\njoy_avoid_repeat[axis] = state\n";
  assert.equal(patchZeldaMudoraAxisRepeat(original), want);
  assert.equal(patchZeldaMudoraAxisRepeat(v4), want);
  assert.equal(patchZeldaMudoraAxisRepeat(want), want);
  // Other arithmetic on axis keeps the crash fix.
  assert.equal(patchZeldaMudoraAxisRepeat("x = axis % 2"), "x = (tonumber(axis) or 0) % 2");
});
