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

test("AssaultCube launches from the package root so core textures resolve", () => {
  const exe = path.join("C:", "Games", "AssaultCube", "bin_win32", "ac_client.exe");
  assert.equal(
    GameLauncher.resolveWorkingDirectory(exe, "assaultcube"),
    path.join("C:", "Games", "AssaultCube")
  );
});

test("AssaultCube bin_unix and ac_client name alone still use the package root", () => {
  const unix = path.join("/games", "AssaultCube", "bin_unix", "ac_client");
  assert.equal(GameLauncher.resolveWorkingDirectory(unix, null), path.join("/games", "AssaultCube"));

  const nested = path.join("C:", "Games", "AssaultCube", "bin_win32", "x64", "ac_client.exe");
  assert.equal(
    GameLauncher.resolveWorkingDirectory(nested, "custom-something"),
    path.join("C:", "Games", "AssaultCube")
  );
});

test("AssaultCube under Wine uses the package root as cwd", () => {
  const fakeRunner = {
    id: "test-wine",
    name: "Test Wine",
    type: "wine",
    binaryPath: "/usr/bin/wine",
  };
  const exe = path.join("/games", "AssaultCube", "bin_win32", "ac_client.exe");
  const spec = buildRunnerLaunchSpec(exe, [], {
    gameSlug: "assaultcube",
    runner: fakeRunner,
  });
  assert.equal(spec.cwd, path.join("/games", "AssaultCube"));
});

test("other games keep the executable directory as their working directory", () => {
  const exe = path.join("C:", "Games", "Example", "bin", "game.exe");
  assert.equal(
    GameLauncher.resolveWorkingDirectory(exe, "example"),
    path.join("C:", "Games", "Example", "bin")
  );
});
