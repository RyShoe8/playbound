const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const {
  detectAvailableRunners,
  resolveDefaultRunner,
  getGamePrefixDirectory,
  buildRunnerLaunchSpec,
  requiresCompatibilityRunner,
} = require("./CompatibilityRunner");

test("requiresCompatibilityRunner", (t) => {
  if (process.platform === "win32") {
    assert.equal(requiresCompatibilityRunner("game.exe"), false);
    assert.equal(requiresCompatibilityRunner("game.jar"), false);
  } else {
    assert.equal(requiresCompatibilityRunner("game.exe"), true);
    assert.equal(requiresCompatibilityRunner("game.EXE"), true);
    assert.equal(requiresCompatibilityRunner("game.msi"), true);
    assert.equal(requiresCompatibilityRunner("game.jar"), false);
    assert.equal(requiresCompatibilityRunner("game.app"), false);
    assert.equal(requiresCompatibilityRunner("game"), false);
  }
});

test("getGamePrefixDirectory creates isolated prefix", () => {
  const tmpRoot = path.join(os.tmpdir(), "playbound-test-" + Date.now());
  try {
    const pfx = getGamePrefixDirectory("freelancer", tmpRoot);
    assert.match(pfx, /prefixes[/\\]freelancer$/);
    assert.equal(fs.existsSync(pfx), true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("buildRunnerLaunchSpec builds Proton launch command and env", () => {
  const fakeProton = {
    id: "steam-proton-9.0",
    name: "Steam Proton 9.0",
    type: "proton",
    binaryPath: "/opt/steam/proton",
    steamPath: "/opt/steam",
  };

  const spec = buildRunnerLaunchSpec("/games/freelancer/Freelancer.exe", ["-connect", "127.0.0.1"], {
    gameSlug: "freelancer",
    runner: fakeProton,
  });

  assert.equal(spec.command, "/opt/steam/proton");
  assert.deepEqual(spec.args, ["run", "/games/freelancer/Freelancer.exe", "-connect", "127.0.0.1"]);
  assert.equal(spec.env.STEAM_COMPAT_CLIENT_INSTALL_PATH, "/opt/steam");
  assert.match(spec.env.STEAM_COMPAT_DATA_PATH, /prefixes[/\\]freelancer$/);
});

test("buildRunnerLaunchSpec builds Wine / CrossOver launch command and env", () => {
  const fakeWine = {
    id: "system-wine64",
    name: "System WINE64",
    type: "wine",
    binaryPath: "/usr/bin/wine64",
  };

  const spec = buildRunnerLaunchSpec("/games/mmu/MegaManUnlimited.exe", [], {
    gameSlug: "mega-man-unlimited",
    runner: fakeWine,
  });

  assert.equal(spec.command, "/usr/bin/wine64");
  assert.deepEqual(spec.args, ["/games/mmu/MegaManUnlimited.exe"]);
  assert.match(spec.env.WINEPREFIX, /prefixes[/\\]mega-man-unlimited$/);
  assert.equal(spec.env.WINEDEBUG, "-all");
});

test("resolveDefaultRunner returns proton on Linux if available", () => {
  const fakeRunners = [
    { id: "system-wine", name: "Wine", type: "wine", binaryPath: "/usr/bin/wine" },
    { id: "steam-proton-9.0", name: "Steam Proton 9.0", type: "proton", binaryPath: "/proton" },
  ];

  if (process.platform === "linux") {
    const selected = resolveDefaultRunner(fakeRunners);
    assert.equal(selected.type, "proton");
  }
});
