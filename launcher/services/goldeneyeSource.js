/**
 * GoldenEye: Source is a Source SDK Base 2007 sourcemod.
 *
 * Play must not treat gesource_run.exe exiting as a crash — that stub hands
 * off to Steam / hl2.exe and returns 0. Prefer steam -applaunch 218 -game …
 * when Steam is available so connect args reach the engine.
 */

const fs = require("fs");
const path = require("path");

const GES_SLUG = "goldeneye-source";
const SDK_APP_ID = "218";
const MOD_FOLDER = "gesource";

/**
 * @param {string[]} libraryRoots Steam library folders (steamBase + extras)
 * @returns {string | null} Absolute path to sourcemods/gesource
 */
function findGesourceDir(libraryRoots) {
  const roots = Array.isArray(libraryRoots) ? libraryRoots : [];
  for (const root of roots) {
    if (!root) continue;
    const dir = path.join(root, "steamapps", "sourcemods", MOD_FOLDER);
    try {
      if (fs.existsSync(path.join(dir, "gameinfo.txt"))) return dir;
    } catch {
      /* unreadable library */
    }
  }
  // Primary Steam install is the only place Steam lists sourcemods from.
  return null;
}

/**
 * @param {{ steamAppState: (appId: string, roots: string[]) => { installed: boolean }, libraryRoots: string[], steamExePath: string | null }} deps
 * @returns {{ ok: true, gesourceDir: string } | { ok: false, code: string, message: string }}
 */
function preflightGoldeneye(deps) {
  const roots = deps.libraryRoots || [];
  if (!deps.steamExePath || !fs.existsSync(deps.steamExePath)) {
    return {
      ok: false,
      code: "GES_STEAM_MISSING",
      message:
        "GoldenEye: Source needs the Steam desktop client and Source SDK Base 2007. Install Steam, then try again.",
    };
  }
  const sdk = deps.steamAppState(SDK_APP_ID, roots);
  if (!sdk?.installed) {
    return {
      ok: false,
      code: "GES_SDK_MISSING",
      message:
        "Source SDK Base 2007 is not installed. Use Install on GoldenEye: Source so PlayBound can install it through Steam first.",
    };
  }
  const gesourceDir = findGesourceDir(roots);
  if (!gesourceDir) {
    return {
      ok: false,
      code: "GES_MOD_MISSING",
      message:
        "GoldenEye: Source is not in Steam's sourcemods folder. Reinstall through PlayBound (Steam + SDK Base 2007, then the official GE:S setup). There is no standalone non-Steam install.",
    };
  }
  return { ok: true, gesourceDir };
}

/**
 * Rewrite launch to steam.exe -applaunch 218 -game "<gesource>" [+connect …]
 * so the tracked process is Steam (or we still spawn gesource_run as fallback).
 *
 * @returns {{ exePath: string, args: string[], watchImages: string[] } | null}
 */
function preferSteamLaunch({ steamExePath, gesourceDir, connectArgs = [] }) {
  if (!steamExePath || !gesourceDir || !fs.existsSync(steamExePath)) return null;
  const args = ["-applaunch", SDK_APP_ID, "-game", gesourceDir];
  for (const a of connectArgs) {
    if (a != null && String(a).length) args.push(String(a));
  }
  return {
    exePath: steamExePath,
    args,
    watchImages: ["hl2.exe", "gesource_run.exe", "steam.exe"],
  };
}

function isGoldenEyeInstaller(filePath, slug) {
  if (slug === GES_SLUG) return true;
  const base = path.basename(filePath || "").toLowerCase();
  return (
    base.startsWith("goldeneye") ||
    base.startsWith("gesource") ||
    base.includes("goldeneye_source")
  );
}

function run7zWithProgress(spawnFn, bin, args, onPercent) {
  return new Promise((resolve, reject) => {
    const finalArgs = [...args];
    if (!finalArgs.includes("-bso0")) finalArgs.push("-bso0");
    if (!finalArgs.includes("-bsp1")) finalArgs.push("-bsp1");

    const child = spawnFn(bin, finalArgs, { windowsHide: true });
    let last = -1;
    let err = "";
    let stdoutErrors = "";

    if (typeof onPercent === "function" && child?.stdout) {
      child.stdout.on?.("data", (chunk) => {
        const matches = String(chunk).match(/(\d{1,3})%/g);
        if (!matches?.length) return;
        const pct = Number(matches[matches.length - 1].replace("%", ""));
        if (!Number.isFinite(pct) || pct === last) return;
        last = pct;
        onPercent(Math.min(100, Math.max(0, pct)));
      });
    }

    if (child?.stderr) {
      child.stderr.on?.("data", (d) => (err += d));
    }
    if (child?.stdout) {
      child.stdout.on?.("data", (d) => {
        const text = String(d);
        if (/error|fail|cannot|disk full|space|corrupt|damaged|break signaled/i.test(text)) {
          stdoutErrors += text;
        }
      });
    }

    let settled = false;
    const finish = (errOrNull) => {
      if (settled) return;
      settled = true;
      if (errOrNull) reject(errOrNull);
      else resolve();
    };

    if (child) {
      child.on?.("error", (e) => finish(e));
      child.on?.("exit", (code) => {
        if (code === 0 || code == null) finish(null);
        else {
          const detail = (err || stdoutErrors).trim();
          finish(
            new Error(
              detail ? `7-Zip failed (${code}): ${detail}` : `7-Zip failed with exit code ${code}`
            )
          );
        }
      });
      child.on?.("close", (code) => {
        if (code === 0 || code == null) finish(null);
        else {
          const detail = (err || stdoutErrors).trim();
          finish(
            new Error(
              detail ? `7-Zip failed (${code}): ${detail}` : `7-Zip failed with exit code ${code}`
            )
          );
        }
      });
    } else {
      finish(new Error("Failed to spawn 7-Zip process"));
    }
  });
}

/**
 * Unpacks GoldenEye: Source mod files into Steam's sourcemods folder.
 *
 * GoldenEye_Source_v5.0.6_full.exe is a 7z SFX containing gesource.7z and gesource_setup.exe.
 * The legacy NSIS setup checks for an active Steam process and fails with a TaskDialog
 * if Steam is not already running.
 *
 * This unpacks gesource.7z directly into steamapps/sourcemods/gesource without running
 * the interactive NSIS wizard or requiring Steam to already be running.
 */
async function unpackGoldenEyeSource(installerPath, sourcemodsDir, opts = {}) {
  const childProcess = opts.childProcess || require("child_process");
  const spawnFn = opts.spawn || childProcess.spawn;
  const fspImpl = opts.fsp || require("fs/promises");
  const fsImpl = opts.fs || fs;
  const osImpl = opts.os || require("os");
  const bin = opts.sevenZipBin;
  const onProgress = opts.onProgress || (() => {});

  if (!bin || !fsImpl.existsSync(bin)) {
    throw new Error("7-Zip binary was not found. Please reinstall PlayBound.");
  }
  if (!fsImpl.existsSync(installerPath)) {
    throw new Error(`GoldenEye: Source installer not found at ${installerPath}`);
  }

  await fspImpl.mkdir(sourcemodsDir, { recursive: true });
  const targetModDir = path.join(sourcemodsDir, MOD_FOLDER);
  const targetGameInfo = path.join(targetModDir, "gameinfo.txt");
  if (fsImpl.existsSync(targetGameInfo)) {
    return { ok: true, targetGameInfo, skipped: true };
  }

  const emitProgress = (payload) => {
    if (typeof onProgress !== "function") return;
    const item = {
      ...payload,
      toString() {
        return this.message || this.addon || "";
      },
    };
    onProgress(item);
  };

  // Self-heal: If an earlier run extracted loose files into sourcemods/ instead of
  // sourcemods/gesource/, move them into the proper mod directory.
  const looseGameInfo = path.join(sourcemodsDir, "gameinfo.txt");
  if (fsImpl.existsSync(looseGameInfo)) {
    try {
      let isGes = false;
      if (typeof fsImpl.readFileSync === "function") {
        const header = fsImpl.readFileSync(looseGameInfo, "utf8");
        isGes = header.includes("GoldenEye: Source");
      } else {
        isGes = true;
      }
      if (isGes) {
        await fspImpl.mkdir(targetModDir, { recursive: true });
        const items = await fspImpl.readdir(sourcemodsDir);
        for (const item of items) {
          if (item.toLowerCase() === MOD_FOLDER.toLowerCase()) continue;
          const src = path.join(sourcemodsDir, item);
          const dst = path.join(targetModDir, item);
          try {
            await fspImpl.rename(src, dst);
          } catch {
            await fspImpl.cp(src, dst, { recursive: true, force: true }).catch(() => {});
            await fspImpl.rm(src, { recursive: true, force: true }).catch(() => {});
          }
        }
        if (fsImpl.existsSync(targetGameInfo)) {
          emitProgress({
            step: 1,
            totalSteps: 1,
            pct: 100,
            stagePct: 100,
            addon: "GoldenEye: Source into Steam sourcemods",
            message: "GoldenEye: Source ready in Steam sourcemods",
          });
          return { ok: true, targetGameInfo, migrated: true };
        }
      }
    } catch {
      /* proceed with normal extraction if migration fails */
    }
  }

  const isBare7z = /\.7z$/i.test(installerPath);
  const totalSteps = isBare7z ? 1 : 2;
  const tempDir = path.join(osImpl.tmpdir(), `gesource-unpack-${Date.now()}`);

  try {
    let archiveToUnpack = installerPath;
    if (!isBare7z) {
      await fspImpl.mkdir(tempDir, { recursive: true });
      emitProgress({
        step: 1,
        totalSteps: 2,
        pct: 0,
        stagePct: 0,
        addon: "installer archive (step 1 of 2)",
        message: "Extracting installer archive (step 1 of 2)",
      });
      await run7zWithProgress(
        spawnFn,
        bin,
        ["e", String(installerPath), "gesource.7z", `-o${tempDir}`, "-y"],
        (stagePct) => {
          // Step 1 represents 0% - 15% of total unpack work
          const pct = Math.min(15, Math.round(stagePct * 0.15));
          emitProgress({
            step: 1,
            totalSteps: 2,
            pct,
            stagePct,
            addon: "installer archive (step 1 of 2)",
            message: "Extracting installer archive (step 1 of 2)",
          });
        }
      );
      archiveToUnpack = path.join(tempDir, "gesource.7z");
      if (!fsImpl.existsSync(archiveToUnpack)) {
        throw new Error("gesource.7z was not found inside the GoldenEye: Source installer.");
      }
    }

    await fspImpl.mkdir(targetModDir, { recursive: true });

    emitProgress({
      step: isBare7z ? 1 : 2,
      totalSteps,
      pct: isBare7z ? 0 : 15,
      stagePct: 0,
      addon: isBare7z
        ? "GoldenEye: Source into Steam sourcemods"
        : "GoldenEye: Source into Steam sourcemods (step 2 of 2)",
      message: isBare7z
        ? "Unpacking GoldenEye: Source into Steam sourcemods"
        : "Unpacking GoldenEye: Source into Steam sourcemods (step 2 of 2)",
    });

    await run7zWithProgress(
      spawnFn,
      bin,
      ["x", String(archiveToUnpack), `-o${targetModDir}`, "-y"],
      (stagePct) => {
        // Step 2 represents 15% - 100% of total unpack work (or 0-100% for bare 7z)
        const pct = isBare7z ? stagePct : Math.min(100, Math.round(15 + stagePct * 0.85));
        emitProgress({
          step: isBare7z ? 1 : 2,
          totalSteps,
          pct,
          stagePct,
          addon: isBare7z
            ? "GoldenEye: Source into Steam sourcemods"
            : "GoldenEye: Source into Steam sourcemods (step 2 of 2)",
          message: isBare7z
            ? "Unpacking GoldenEye: Source into Steam sourcemods"
            : "Unpacking GoldenEye: Source into Steam sourcemods (step 2 of 2)",
        });
      }
    );

    emitProgress({
      step: totalSteps,
      totalSteps,
      pct: 100,
      stagePct: 100,
      addon: isBare7z
        ? "GoldenEye: Source into Steam sourcemods"
        : "GoldenEye: Source into Steam sourcemods (step 2 of 2)",
      message: "Unpacking GoldenEye: Source into Steam sourcemods complete",
    });

    if (!fsImpl.existsSync(targetGameInfo)) {
      throw new Error("GoldenEye: Source extraction completed, but gameinfo.txt was not found.");
    }

    return { ok: true, targetGameInfo };
  } finally {
    try {
      if (fsImpl.existsSync(tempDir)) {
        await fspImpl.rm(tempDir, { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  GES_SLUG,
  SDK_APP_ID,
  MOD_FOLDER,
  findGesourceDir,
  preflightGoldeneye,
  preferSteamLaunch,
  isGoldenEyeInstaller,
  unpackGoldenEyeSource,
};
