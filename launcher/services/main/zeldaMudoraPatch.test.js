"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// gameFixes is an Electron main-process module. Its patch function is pure;
// stub only the runtime dependencies so this can run under Node's test runner.
const originalLoad = Module._load;
let patchZeldaMudoraGameManager;
try {
  Module._load = function(request, parent, isMain) {
    if (parent?.filename?.endsWith("gameFixes.js")) {
      if (request === "electron") return { app: {} };
      if (request === "./core" || request === "../daggerfallData") return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  ({ patchZeldaMudoraGameManager } = require("./gameFixes"));
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
  assert.equal((fixed.match(/game:set_command_joypad_binding\("action"/g) || []).length, 1);
  assert.equal(patchZeldaMudoraGameManager(fixed), fixed);
});
