"use strict";

/**
 * Opening a game's Epic store page in the Epic Games Launcher when the player
 * has it, and in the browser when they do not.
 *
 * Catalog recipes keep the https store URL (store.epicgames.com/p/<slug>),
 * which works for everyone. When the launcher is installed, the same page is
 * opened as com.epicgames.launcher://store/p/<slug>, so Get and Install happen
 * in Epic instead of a browser tab asking the player to open it there.
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

/** The product slug from an Epic store URL, or null. Locale prefixes are allowed. */
function epicStoreSlug(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl || ""));
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname.toLowerCase() !== "store.epicgames.com") return null;
  const m = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?p\/([a-z0-9][a-z0-9-]{0,99})\/?$/.exec(u.pathname);
  return m ? m[1] : null;
}

/** The launcher deep link for a store slug. */
function epicLauncherStoreLink(slug) {
  return `com.epicgames.launcher://store/p/${slug}`;
}

/**
 * Whether a URL is exactly the deep link epicLauncherStoreLink produces.
 * Used by the external-URL allowlist: the protocol handler accepts other
 * commands (launching apps, installing), and only store pages are let through.
 */
function isEpicLauncherStoreLink(u) {
  return (
    u.protocol.toLowerCase() === "com.epicgames.launcher:" &&
    u.hostname.toLowerCase() === "store" &&
    /^\/p\/[a-z0-9][a-z0-9-]{0,99}\/?$/.test(u.pathname) &&
    !u.username &&
    !u.password &&
    !u.search &&
    !u.hash
  );
}

const WINDOWS_LAUNCHER_PATHS = [
  "Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe",
  "Epic Games\\Launcher\\Portal\\Binaries\\Win32\\EpicGamesLauncher.exe",
];

function regQueryExists(key) {
  return new Promise((resolve) => {
    execFile("reg", ["query", key], { windowsHide: true, timeout: 3000 }, (err) => resolve(!err));
  });
}

/**
 * Whether the Epic Games Launcher is installed: its executable in a Program
 * Files folder, or its URL protocol registered (which also covers an install
 * on another drive). macOS checks the app bundle. Other platforms have no
 * Epic launcher.
 */
async function isEpicLauncherInstalled({ platform = process.platform, env = process.env, exists = fs.existsSync, regQuery = regQueryExists } = {}) {
  if (platform === "win32") {
    const roots = [env["ProgramFiles(x86)"], env.ProgramFiles].filter(Boolean);
    for (const root of roots) {
      for (const rel of WINDOWS_LAUNCHER_PATHS) {
        if (exists(path.win32.join(root, rel))) return true;
      }
    }
    return (await regQuery("HKCR\\com.epicgames.launcher")) || (await regQuery("HKCU\\Software\\Classes\\com.epicgames.launcher"));
  }
  if (platform === "darwin") {
    return exists("/Applications/Epic Games Launcher.app");
  }
  return false;
}

/** The URL to open for an Epic store page: the launcher link when Epic is installed, otherwise the original. */
async function epicStoreOpenUrl(rawUrl, deps) {
  const slug = epicStoreSlug(rawUrl);
  if (!slug) return null;
  return (await isEpicLauncherInstalled(deps)) ? epicLauncherStoreLink(slug) : null;
}

module.exports = { epicStoreSlug, epicLauncherStoreLink, isEpicLauncherStoreLink, isEpicLauncherInstalled, epicStoreOpenUrl };
