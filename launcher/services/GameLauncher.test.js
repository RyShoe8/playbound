const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const GameLauncher = require("./GameLauncher");
const { requiresCompatibilityRunner, buildRunnerLaunchSpec } = require("./CompatibilityRunner");

test("GameLauncher respects requiresCompatibilityRunner", () => {
  if (process.platform === "win32") {
    assert.equal(requiresCompatibilityRunner("some/path/game.exe"), false);
  } else {
    assert.equal(requiresCompatibilityRunner("some/path/game.exe"), true);
    assert.equal(requiresCompatibilityRunner("some/path/mod.exe"), true);
    assert.equal(requiresCompatibilityRunner("some/path/edition.exe"), true);
    assert.equal(requiresCompatibilityRunner("some/path/game.jar"), false);
    assert.equal(requiresCompatibilityRunner("some/path/game.app"), false);
  }
});

test("GameLauncher builds runner specs for editions and mods", () => {
  const fakeRunner = {
    id: "test-wine",
    name: "Test Wine",
    type: "wine",
    binaryPath: "/usr/bin/wine",
  };

  // Edition launch test
  const editionSpec = buildRunnerLaunchSpec("/games/everquest/quarm/eqgame.exe", ["patchme"], {
    gameSlug: "everquest-project-quarm",
    runner: fakeRunner,
  });
  assert.equal(editionSpec.command, "/usr/bin/wine");
  assert.deepEqual(editionSpec.args, ["/games/everquest/quarm/eqgame.exe", "patchme"]);
  assert.match(editionSpec.env.WINEPREFIX, /prefixes[/\\]everquest-project-quarm$/);

  // Mod launch test
  const modSpec = buildRunnerLaunchSpec("/games/freelancer/mods/fl-hd/Freelancer.exe", [], {
    gameSlug: "freelancer-hd-edition",
    runner: fakeRunner,
  });
  assert.equal(modSpec.command, "/usr/bin/wine");
  assert.deepEqual(modSpec.args, ["/games/freelancer/mods/fl-hd/Freelancer.exe"]);
  assert.match(modSpec.env.WINEPREFIX, /prefixes[/\\]freelancer-hd-edition$/);
});
