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
  const targetGameInfo = path.join(sourcemodsDir, MOD_FOLDER, "gameinfo.txt");
  if (fsImpl.existsSync(targetGameInfo)) {
    return { ok: true, targetGameInfo, skipped: true };
  }

  const isBare7z = /\.7z$/i.test(installerPath);
  const tempDir = path.join(osImpl.tmpdir(), `gesource-unpack-${Date.now()}`);

  try {
    let archiveToUnpack = installerPath;
    if (!isBare7z) {
      await fspImpl.mkdir(tempDir, { recursive: true });
      onProgress("Extracting GoldenEye: Source archive…");
      await new Promise((resolve, reject) => {
        const child = spawnFn(
          bin,
          ["e", String(installerPath), "gesource.7z", `-o${tempDir}`, "-y"],
          { windowsHide: true }
        );
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0 || code == null) resolve();
          else reject(new Error(`Failed to extract gesource.7z from installer (exit code ${code})`));
        });
      });
      archiveToUnpack = path.join(tempDir, "gesource.7z");
      if (!fsImpl.existsSync(archiveToUnpack)) {
        throw new Error("gesource.7z was not found inside the GoldenEye: Source installer.");
      }
    }

    onProgress("Unpacking GoldenEye: Source into Steam sourcemods…");
    await new Promise((resolve, reject) => {
      const child = spawnFn(
        bin,
        ["x", String(archiveToUnpack), `-o${sourcemodsDir}`, "-y"],
        { windowsHide: true }
      );
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0 || code == null) resolve();
        else reject(new Error(`Failed to unpack gesource into sourcemods (exit code ${code})`));
      });
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
