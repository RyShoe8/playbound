"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  findGesourceDir,
  preflightGoldeneye,
  preferSteamLaunch,
  SDK_APP_ID,
} = require("./goldeneyeSource");

describe("goldeneyeSource", () => {
  it("finds gesource when gameinfo.txt exists", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ges-"));
    const mod = path.join(root, "steamapps", "sourcemods", "gesource");
    await fsp.mkdir(mod, { recursive: true });
    await fsp.writeFile(path.join(mod, "gameinfo.txt"), "GameInfo\n{\n}\n");
    assert.equal(findGesourceDir([root]), mod);
  });

  it("preflight fails clearly without Steam", () => {
    const r = preflightGoldeneye({
      steamExePath: null,
      libraryRoots: [],
      steamAppState: () => ({ installed: false }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "GES_STEAM_MISSING");
  });

  it("preferSteamLaunch builds applaunch args", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ges-steam-"));
    const steamExe = path.join(root, "steam.exe");
    const gesourceDir = path.join(root, "gesource");
    await fsp.writeFile(steamExe, "");
    await fsp.mkdir(gesourceDir);
    const launch = preferSteamLaunch({
      steamExePath: steamExe,
      gesourceDir,
      connectArgs: ["+connect", "1.2.3.4:27015"],
    });
    assert.equal(launch.exePath, steamExe);
    assert.deepEqual(launch.args, [
      "-applaunch",
      SDK_APP_ID,
      "-game",
      gesourceDir,
      "+connect",
      "1.2.3.4:27015",
    ]);
    assert.ok(launch.watchImages.includes("hl2.exe"));
  });

  it("isGoldenEyeInstaller identifies GES installers and slugs", () => {
    const { isGoldenEyeInstaller } = require("./goldeneyeSource");
    assert.equal(isGoldenEyeInstaller("C:\\Downloads\\GoldenEye_Source_v5.0.6_full.exe", "goldeneye-source"), true);
    assert.equal(isGoldenEyeInstaller("C:\\Downloads\\gesource.7z", "goldeneye-source"), true);
    assert.equal(isGoldenEyeInstaller("C:\\Downloads\\something.exe", "goldeneye-source"), true);
    assert.equal(isGoldenEyeInstaller("C:\\Downloads\\GoldenEye_Source_v5.0.6_full.exe", "other-game"), true);
    assert.equal(isGoldenEyeInstaller("C:\\Downloads\\setup.exe", "other-game"), false);
  });

  it("unpackGoldenEyeSource skips if already present", async () => {
    const { unpackGoldenEyeSource } = require("./goldeneyeSource");
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ges-unpack-"));
    const sourcemods = path.join(root, "sourcemods");
    const targetDir = path.join(sourcemods, "gesource");
    await fsp.mkdir(targetDir, { recursive: true });
    await fsp.writeFile(path.join(targetDir, "gameinfo.txt"), "content");
    const fakeInstaller = path.join(root, "installer.exe");
    await fsp.writeFile(fakeInstaller, "fake");

    const result = await unpackGoldenEyeSource(fakeInstaller, sourcemods, {
      sevenZipBin: "dummy7z",
      fs: {
        existsSync: (p) => fs.existsSync(p) || p === "dummy7z",
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
  });
});
