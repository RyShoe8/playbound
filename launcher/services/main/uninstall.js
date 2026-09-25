"use strict";

/*
 * Moved out of main.js unchanged: helpers that touch no main-process state
 * (no windows, sessions or timers). main.js requires what it needs from here.
 */

const { app } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { getGamePrefixDirectory } = require("../CompatibilityRunner");
const { DEFAULT_EDITION_SLUG, DEFAULT_GAMES_DIR, editionInstallDir, ensureGameInstallRecord, expandWinPath, gamesRoot, listEditionEntries, loadSettings, loadState, pathUnderRoot, saveSettings } = require("./core");
const { killProcessesUnderDirs } = require("./processes");

function isProtectedSaveDirectory(dir) {
  if (!dir) return false;
  const norm = path.normalize(dir).toLowerCase();
  const localAppData = (process.env.LOCALAPPDATA || "").toLowerCase();
  if (localAppData && norm === path.join(localAppData, "holocure").toLowerCase()) {
    return true;
  }
  return false;
}

async function removeDirWithRetries(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  if (isProtectedSaveDirectory(dir)) {
    console.warn(`[uninstall] Refusing to delete protected user save directory: ${dir}`);
    return;
  }
  const waits = [0, 350, 500, 500, 700];
  let lastErr = null;
  for (let i = 0; i < waits.length; i++) {
    const wait = waits[i];
    if (wait) await new Promise((r) => setTimeout(r, wait));
    // Re-kill path-based processes mid-retry (Godot can respawn briefly).
    if (i > 0) killProcessesUnderDirs([dir]);
    try {
      await fsp.rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      lastErr = err;
      const code = err?.code;
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(code)) throw err;
    }
  }
  throw new Error(
    `Could not remove "${dir}" (folder still in use). Close the game and any Explorer windows on that folder, then try again.${
      lastErr?.message ? ` (${lastErr.message})` : ""
    }`
  );
}

/**
 * Zip cleanup after Expand-Archive. Windows often still holds the file
 * (EBUSY). Extraction already succeeded, so a leftover zip must not fail
 * the install.
 */
async function removeFileWithRetries(filePath, { required = false } = {}) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const waits = [0, 350, 500, 500, 700];
  let lastErr = null;
  for (let i = 0; i < waits.length; i++) {
    const wait = waits[i];
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      await fsp.rm(filePath, { force: true });
      return;
    } catch (err) {
      lastErr = err;
      const code = err?.code;
      if (!["EBUSY", "EPERM", "EACCES"].includes(code)) {
        if (required) throw err;
        console.warn(`[install] Could not remove "${filePath}":`, err?.message || err);
        return;
      }
    }
  }
  const detail = lastErr?.message || lastErr?.code || "EBUSY";
  if (required) {
    throw lastErr || new Error(`Could not remove "${filePath}" (${detail})`);
  }
  console.warn(`[install] Zip still locked after extract, leaving "${filePath}" (${detail})`);
}

function sameFsPath(a, b) {
  if (!a || !b) return false;
  const left = path.resolve(String(a));
  const right = path.resolve(String(b));
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isPlayBoundManagedModDir(slug, dir) {
  if (!slug || !dir) return false;
  return sameFsPath(dir, path.join(gamesRoot(), slug));
}

function isBaseGameInstallDir(baseGameSlug, dir) {
  if (!baseGameSlug || !dir) return false;
  const state = loadState();
  const game = ensureGameInstallRecord(state[baseGameSlug]);
  if (!game) return false;
  const dirs = [
    game.dir,
    ...Object.values(game.editions || {}).map((e) => e && e.dir),
  ].filter(Boolean);
  return dirs.some((d) => sameFsPath(d, dir));
}

function listModSlugsForBaseGame(baseGameSlug) {
  if (!baseGameSlug) return [];
  const state = loadState();
  const mods = state.__mods__ && typeof state.__mods__ === "object" ? state.__mods__ : {};
  const out = [];
  for (const [modSlug, info] of Object.entries(mods)) {
    if (info && typeof info === "object" && info.baseGameSlug === baseGameSlug) {
      out.push(modSlug);
    }
  }
  return out;
}

function isPlayBoundCompatPrefixDir(slug, dir) {
  if (!slug || !dir || process.platform === "win32") return false;
  try {
    const prefixRoot = path.resolve(getGamePrefixDirectory(slug));
    const resolved = path.resolve(dir);
    if (sameFsPath(resolved, prefixRoot)) return true;
    return pathUnderRoot(resolved, prefixRoot);
  } catch {
    return false;
  }
}

/**
 * True when `root` looks like a PlayBound (or legacy) games library folder.
 * Used to heal formerGamesDirs from install records without treating GOG/Steam
 * parents as owned library roots.
 */
function looksLikePlayBoundGamesRoot(root) {
  if (!root) return false;
  try {
    return path.basename(path.resolve(root)).toLowerCase() === "games";
  } catch {
    return false;
  }
}

/**
 * Current + former + platform-default games library roots.
 * Players often change Settings → games folder; installs stay on the old drive
 * and must still uninstall (C:\\Games\\xonotic after switching to D:\\Games).
 */
function playBoundGamesRoots() {
  const settings = loadSettings();
  const roots = [];
  const add = (raw) => {
    if (!raw) return;
    try {
      const resolved = path.resolve(String(raw).trim());
      if (!resolved) return;
      if (roots.some((r) => sameFsPath(r, resolved))) return;
      roots.push(resolved);
    } catch {
      /* ignore */
    }
  };
  add(gamesRoot());
  add(DEFAULT_GAMES_DIR);
  for (const r of settings.formerGamesDirs || []) add(r);
  return roots;
}

function rememberFormerGamesDir(dir, { force = false } = {}) {
  if (!dir) return;
  let resolved;
  try {
    resolved = path.resolve(String(dir).trim());
  } catch {
    return;
  }
  if (!resolved) return;
  if (!force && !looksLikePlayBoundGamesRoot(resolved)) return;
  try {
    if (sameFsPath(resolved, path.resolve(gamesRoot()))) return;
  } catch {
    /* ignore */
  }
  const settings = loadSettings();
  const list = Array.isArray(settings.formerGamesDirs)
    ? settings.formerGamesDirs.map((r) => String(r || "").trim()).filter(Boolean)
    : [];
  if (list.some((r) => sameFsPath(r, resolved))) return;
  list.push(resolved);
  settings.formerGamesDirs = list.slice(-12);
  saveSettings(settings);
}

/** Infer former library roots from installs still recorded under …/Games/<slug>. */
function healFormerGamesDirsFromInstalls() {
  try {
    const state = loadState();
    for (const [slug, raw] of Object.entries(state || {})) {
      if (!slug || slug.startsWith("__")) continue;
      let game;
      try {
        game = ensureGameInstallRecord(raw);
      } catch {
        continue;
      }
      for (const info of listEditionEntries(game)) {
        const d = info?.dir || (info?.exe ? path.dirname(info.exe) : null);
        if (!d) continue;
        let cur = path.resolve(d);
        for (let i = 0; i < 5; i++) {
          if (path.basename(cur).toLowerCase() === String(slug).toLowerCase()) {
            rememberFormerGamesDir(path.dirname(cur));
            break;
          }
          const parent = path.dirname(cur);
          if (sameFsPath(parent, cur)) break;
          cur = parent;
        }
      }
    }
  } catch (err) {
    console.warn("[uninstall] former gamesDir heal failed:", err?.message || err);
  }
}

function isPlayBoundManagedInstallDir(slug, dir) {
  if (!slug || !dir) return false;
  healFormerGamesDirsFromInstalls();
  const resolved = path.resolve(dir);
  if (isPlayBoundCompatPrefixDir(slug, dir)) return true;

  for (const root of playBoundGamesRoots()) {
    if (sameFsPath(resolved, root)) continue;
    const slugRoot = path.resolve(path.join(root, slug));
    if (sameFsPath(resolved, slugRoot)) return true;
    if (process.platform === "win32") {
      const relToSlug = path.relative(slugRoot.toLowerCase(), resolved.toLowerCase());
      if (relToSlug === "" || (!relToSlug.startsWith("..") && !path.isAbsolute(relToSlug))) {
        return true;
      }
      // Only the slug folder (and below) under a known library root — never a
      // sibling like C:\\Games\\OtherTitle when uninstalling this slug.
      const relToGames = path.relative(root.toLowerCase(), resolved.toLowerCase());
      if (
        relToGames !== "" &&
        !relToGames.startsWith("..") &&
        !path.isAbsolute(relToGames)
      ) {
        const first = relToGames.split(/[/\\]/)[0];
        if (first && first.toLowerCase() === String(slug).toLowerCase()) return true;
      }
    } else if (pathUnderRoot(resolved, slugRoot)) {
      return true;
    }
  }
  return false;
}

/**
 * Best folder to delete for an edition uninstall.
 * Prefer the recorded dir; fall back to the exe's folder or the canonical
 * edition install path when those are still under the PlayBound games root —
 * Locate / stale records otherwise left zip games on disk after "uninstall".
 */
function resolveEditionUninstallDir(slug, editionSlug, info) {
  const candidates = [];
  if (info?.dir) candidates.push(info.dir);
  if (info?.exe) candidates.push(path.dirname(info.exe));
  if (editionSlug && editionSlug !== DEFAULT_EDITION_SLUG) {
    candidates.push(editionInstallDir(slug, editionSlug));
  }
  for (const root of playBoundGamesRoots()) {
    candidates.push(path.join(root, slug));
    if (editionSlug && editionSlug !== DEFAULT_EDITION_SLUG) {
      candidates.push(path.join(root, slug, editionSlug));
    }
  }

  const seen = new Set();
  for (const raw of candidates) {
    if (!raw) continue;
    const resolved = path.resolve(raw);
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fs.existsSync(resolved)) continue;
    if (isPlayBoundManagedInstallDir(slug, resolved) && !isUnsafeUninstallDir(resolved)) {
      return resolved;
    }
  }
  // Last resort: recorded dir even if outside (caller decides whether to delete).
  return info?.dir && fs.existsSync(info.dir) ? path.resolve(info.dir) : null;
}

/**
 * Every folder we should try to remove for a full-game uninstall.
 * Includes edition dirs, exe parents, the slug games-root folder, and catalog
 * knownExePaths parents (BZFlag → Program Files\\BZFlag, etc.).
 */
function collectGameUninstallDirs(slug, game, entry) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    if (!raw) return;
    try {
      const resolved = path.resolve(raw);
      if (!fs.existsSync(resolved)) return;
      const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(resolved);
    } catch {
      /* ignore */
    }
  };

  const pushWithParent = (raw) => {
    if (!raw) return;
    push(raw);
    try {
      const resolved = path.resolve(raw);
      const b = path.basename(resolved).toLowerCase();
      if (["bin", "bins", "system", "game", "win32", "win64", "x86", "x64"].includes(b)) {
        push(path.dirname(resolved));
      }
    } catch {
      /* ignore */
    }
  };

  for (const info of listEditionEntries(game)) {
    push(resolveEditionUninstallDir(slug, info.editionSlug || DEFAULT_EDITION_SLUG, info));
    // Outside games-root but still the recorded install (installer games).
    if (info.dir) pushWithParent(info.dir);
    if (info.exe) pushWithParent(path.dirname(info.exe));
  }
  push(resolveEditionUninstallDir(slug, null, { dir: game.dir, exe: game.exe }));
  if (game.dir) pushWithParent(game.dir);
  if (game.exe) pushWithParent(path.dirname(game.exe));
  for (const root of playBoundGamesRoots()) {
    push(path.join(root, slug));
  }

  for (const raw of entry?.knownExePaths || []) {
    try {
      const full = expandWinPath(String(raw));
      if (!full || !path.isAbsolute(full)) continue;
      if (fs.existsSync(full)) pushWithParent(path.dirname(full));
      else if (fs.existsSync(path.dirname(full))) pushWithParent(path.dirname(full));
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * Find an uninstaller executable inside an install directory or its immediate parent
 * (e.g. if the game exe was in bins/ or bin/).
 * Matches Inno Setup (unins000.exe), NSIS (uninstall.exe, uninst.exe), and generic uninstallers.
 */
function findUninstallerBinary(dir) {
  if (!dir || process.platform !== "win32") return null;
  const dirsToCheck = [];
  try {
    const resolved = path.resolve(dir);
    dirsToCheck.push(resolved);
    const base = path.basename(resolved).toLowerCase();
    if (["bin", "bins", "system", "game", "win32", "win64", "x86", "x64"].includes(base)) {
      dirsToCheck.push(path.dirname(resolved));
    }
  } catch {
    dirsToCheck.push(dir);
  }

  for (const d of dirsToCheck) {
    if (!fs.existsSync(d)) continue;
    try {
      const files = fs.readdirSync(d);
      const uninstallerFile = files.find((f) =>
        /^(unins.*|uninstall.*|uninst.*)\.exe$/i.test(f)
      );
      if (uninstallerFile) {
        return path.join(d, uninstallerFile);
      }
    } catch (err) {
      console.warn(`[uninstall] readdir failed for ${d}:`, err?.message);
    }
  }
  return null;
}

/**
 * Catalog knownExePaths that name a dedicated product folder (not a drive root
 * or Program Files itself). Installer games like BZFlag land here; after the
 * vendor uninstaller runs we still need permission to delete leftovers.
 */
function isCatalogKnownInstallDir(entry, dir) {
  if (!entry || !dir) return false;
  const resolved = path.resolve(dir);
  if (isUnsafeUninstallDir(resolved)) return false;
  for (const raw of entry.knownExePaths || []) {
    try {
      const full = expandWinPath(String(raw));
      if (!full || !path.isAbsolute(full)) continue;
      const knownDir = path.resolve(path.dirname(full));
      if (isUnsafeUninstallDir(knownDir)) continue;
      if (sameFsPath(resolved, knownDir)) return true;
      if (pathUnderRoot(resolved, knownDir)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function isUnsafeUninstallDir(dir) {
  if (!dir) return true;
  const resolved = path.resolve(dir);
  const { root } = path.parse(resolved);
  if (root && sameFsPath(resolved, root)) return true;
  try {
    if (sameFsPath(resolved, app.getPath("home"))) return true;
    if (sameFsPath(resolved, app.getPath("userData"))) return true;
  } catch {
    /* ignore */
  }
  for (const envKey of ["ProgramFiles", "ProgramFiles(x86)", "SystemRoot", "windir"]) {
    const val = process.env[envKey];
    if (val && sameFsPath(resolved, val)) return true;
  }
  return sameFsPath(resolved, path.resolve(gamesRoot()));
}

module.exports = { isProtectedSaveDirectory, removeDirWithRetries, removeFileWithRetries, sameFsPath, isPlayBoundManagedModDir, isBaseGameInstallDir, listModSlugsForBaseGame, isPlayBoundCompatPrefixDir, looksLikePlayBoundGamesRoot, playBoundGamesRoots, rememberFormerGamesDir, healFormerGamesDirsFromInstalls, isPlayBoundManagedInstallDir, resolveEditionUninstallDir, collectGameUninstallDirs, findUninstallerBinary, isCatalogKnownInstallDir, isUnsafeUninstallDir };
