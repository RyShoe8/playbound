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

module.exports = {
  GES_SLUG,
  SDK_APP_ID,
  MOD_FOLDER,
  findGesourceDir,
  preflightGoldeneye,
  preferSteamLaunch,
};
