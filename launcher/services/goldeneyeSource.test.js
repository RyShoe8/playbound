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

  it("unpackGoldenEyeSource reports progress and percentages across 2 steps for exe installers", async () => {
    const { unpackGoldenEyeSource } = require("./goldeneyeSource");
    const { EventEmitter } = require("events");
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ges-progress-"));
    const sourcemods = path.join(root, "sourcemods");
    const fakeInstaller = path.join(root, "GoldenEye_Source_v5.0.6_full.exe");
    await fsp.writeFile(fakeInstaller, "fake");

    const progressReports = [];
    let spawnCount = 0;

    const mockSpawn = (bin, args) => {
      spawnCount += 1;
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();

      // Check that 7z progress flags were passed
      assert.ok(args.includes("-bso0"), "must pass -bso0");
      assert.ok(args.includes("-bsp1"), "must pass -bsp1");

      process.nextTick(() => {
        // Simulate 7-Zip progress output
        child.stdout.emit("data", Buffer.from(" 10%"));
        child.stdout.emit("data", Buffer.from(" 50%"));
        child.stdout.emit("data", Buffer.from(" 100%"));

        if (spawnCount === 1) {
          // In step 1, simulate extraction of gesource.7z into temp dir
          const outFlag = args.find((a) => a.startsWith("-o"));
          const tempDir = outFlag ? outFlag.slice(2) : null;
          if (tempDir) {
            fs.mkdirSync(tempDir, { recursive: true });
            fs.writeFileSync(path.join(tempDir, "gesource.7z"), "fake 7z");
          }
        } else if (spawnCount === 2) {
          // In step 2, simulate extraction of gameinfo.txt into targetModDir (sourcemods/gesource)
          const outFlag = args.find((a) => a.startsWith("-o"));
          const destDir = outFlag ? outFlag.slice(2) : null;
          if (destDir) {
            fs.mkdirSync(destDir, { recursive: true });
            fs.writeFileSync(path.join(destDir, "gameinfo.txt"), "GameInfo {}");
          }
        }
        child.emit("close", 0);
      });

      return child;
    };

    const result = await unpackGoldenEyeSource(fakeInstaller, sourcemods, {
      sevenZipBin: "dummy7z",
      spawn: mockSpawn,
      fs: {
        existsSync: (p) => fs.existsSync(p) || p === "dummy7z",
      },
      onProgress: (p) => {
        progressReports.push({ ...p, str: String(p) });
      },
    });

    assert.equal(result.ok, true);
    assert.equal(spawnCount, 2);
    assert.ok(progressReports.length >= 6);

    // Verify step 1 reports
    const step1Reports = progressReports.filter((r) => r.step === 1);
    assert.ok(step1Reports.length > 0);
    assert.equal(step1Reports[0].totalSteps, 2);
    assert.ok(step1Reports.some((r) => r.pct > 0 && r.pct <= 15));

    // Verify step 2 reports
    const step2Reports = progressReports.filter((r) => r.step === 2);
    assert.ok(step2Reports.length > 0);
    assert.equal(step2Reports[0].totalSteps, 2);
    assert.ok(step2Reports.some((r) => r.pct >= 15 && r.pct <= 100));

    // Final report should be 100%
    const last = progressReports[progressReports.length - 1];
    assert.equal(last.pct, 100);
    assert.ok(last.str.includes("GoldenEye: Source"));
  });

  it("unpackGoldenEyeSource reports 1-step progress for bare .7z files", async () => {
    const { unpackGoldenEyeSource } = require("./goldeneyeSource");
    const { EventEmitter } = require("events");
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ges-bare7z-"));
    const sourcemods = path.join(root, "sourcemods");
    const fake7z = path.join(root, "gesource.7z");
    await fsp.writeFile(fake7z, "fake");

    const progressReports = [];
    let spawnCount = 0;

    const mockSpawn = (bin, args) => {
      spawnCount += 1;
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();

      process.nextTick(() => {
        child.stdout.emit("data", Buffer.from(" 25%"));
        child.stdout.emit("data", Buffer.from(" 75%"));

        const outFlag = args.find((a) => a.startsWith("-o"));
        const destDir = outFlag ? outFlag.slice(2) : null;
        if (destDir) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.writeFileSync(path.join(destDir, "gameinfo.txt"), "GameInfo {}");
        }
        child.emit("close", 0);
      });

      return child;
    };

    const result = await unpackGoldenEyeSource(fake7z, sourcemods, {
      sevenZipBin: "dummy7z",
      spawn: mockSpawn,
      fs: {
        existsSync: (p) => fs.existsSync(p) || p === "dummy7z",
      },
      onProgress: (p) => progressReports.push(p),
    });

    assert.equal(result.ok, true);
    assert.equal(spawnCount, 1);
    assert.ok(progressReports.every((r) => r.totalSteps === 1));
    assert.ok(progressReports.some((r) => r.pct === 25));
    assert.ok(progressReports.some((r) => r.pct === 75));
    assert.equal(progressReports[progressReports.length - 1].pct, 100);
  });

  it("unpackGoldenEyeSource migrates loose files if previously extracted to root sourcemods", async () => {
    const { unpackGoldenEyeSource } = require("./goldeneyeSource");
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ges-migrate-"));
    const sourcemods = path.join(root, "sourcemods");
    await fsp.mkdir(sourcemods, { recursive: true });
    // Simulate loose extraction in sourcemods/
    await fsp.writeFile(path.join(sourcemods, "gameinfo.txt"), "game \"GoldenEye: Source (v5.0)\"");
    await fsp.mkdir(path.join(sourcemods, "maps"), { recursive: true });
    await fsp.writeFile(path.join(sourcemods, "maps", "ge_facility.bsp"), "bsp");

    const fakeInstaller = path.join(root, "installer.exe");
    await fsp.writeFile(fakeInstaller, "fake");

    const result = await unpackGoldenEyeSource(fakeInstaller, sourcemods, {
      sevenZipBin: "dummy7z",
      fs: {
        existsSync: (p) => fs.existsSync(p) || p === "dummy7z",
        readFileSync: (p, enc) => fs.readFileSync(p, enc),
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.migrated, true);
    // Files should now be inside sourcemods/gesource/
    assert.ok(fs.existsSync(path.join(sourcemods, "gesource", "gameinfo.txt")));
    assert.ok(fs.existsSync(path.join(sourcemods, "gesource", "maps", "ge_facility.bsp")));
  });

  it("unpackGoldenEyeSource propagates 7-Zip process error cleanly", async () => {
    const { unpackGoldenEyeSource } = require("./goldeneyeSource");
    const { EventEmitter } = require("events");
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ges-err-"));
    const sourcemods = path.join(root, "sourcemods");
    const fakeInstaller = path.join(root, "installer.exe");
    await fsp.writeFile(fakeInstaller, "fake");

    const mockSpawn = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stderr.emit("data", Buffer.from("Corrupt archive data"));
        child.emit("close", 2);
      });
      return child;
    };

    await assert.rejects(
      () =>
        unpackGoldenEyeSource(fakeInstaller, sourcemods, {
          sevenZipBin: "dummy7z",
          spawn: mockSpawn,
          fs: {
            existsSync: (p) => fs.existsSync(p) || p === "dummy7z",
          },
        }),
      /Corrupt archive data|7-Zip failed/
    );
  });
});
