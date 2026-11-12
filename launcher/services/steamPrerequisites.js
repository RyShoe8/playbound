"use strict";

const fs = require("fs");
const path = require("path");

function acfValue(text, key) {
  const match = String(text || "").match(new RegExp(`"${key}"\\s+"([^"]*)"`, "i"));
  return match ? match[1] : null;
}

/** Return install/download state for a Steam app across all configured libraries. */
function steamAppState(appId, libraryRoots, io = fs) {
  const id = String(appId || "").trim();
  if (!/^\d+$/.test(id)) return { installed: false, progress: null };

  let bestProgress = null;
  for (const root of Array.isArray(libraryRoots) ? libraryRoots : []) {
    const manifest = path.join(root, "steamapps", `appmanifest_${id}.acf`);
    let text;
    try {
      text = io.readFileSync(manifest, "utf8");
    } catch {
      continue;
    }

    const stateFlags = Number(acfValue(text, "StateFlags") || 0);
    const installDir = acfValue(text, "installdir");
    const downloaded = Number(acfValue(text, "BytesDownloaded") || 0);
    const total = Number(acfValue(text, "BytesToDownload") || 0);
    if (total > 0) bestProgress = Math.max(bestProgress || 0, Math.min(1, downloaded / total));

    const contentDir = installDir ? path.join(root, "steamapps", "common", installDir) : null;
    if ((stateFlags & 4) === 4 && contentDir && io.existsSync(contentDir)) {
      return { installed: true, progress: 1, contentDir, manifest };
    }
  }
  return { installed: false, progress: bestProgress };
}

/** Catalog store metadata is not proof that the installed copy uses Steam. */
function steamRuntimeForLaunch(kind, launchPath, appId) {
  const inSteamLibrary = /[\\/]steamapps[\\/]common[\\/]/i.test(String(launchPath || ""));
  const steamManaged = inSteamLibrary || kind === "steam" || (kind === "external" && Boolean(appId));
  return {
    needsSteam: steamManaged,
    appId: steamManaged && /^\d+$/.test(String(appId || "")) ? String(appId) : null,
  };
}

/**
 * The Steam app id of the game an executable belongs to, read from Steam's own
 * appmanifest for the folder it sits in. A catalog entry that installs a
 * non-Steam build (HoloCure from itch.io) carries no app id, yet the player's
 * copy may be Steam's; launched without one, a Steamworks game restarts itself
 * through the Steam client and PlayBound reported the handoff as a failure.
 * Null when the path is not in a Steam library or no manifest names its folder.
 */
function steamAppIdFromLibraryPath(launchPath, io = fs) {
  const match = String(launchPath || "").match(/^(.*[\\/]steamapps)[\\/]common[\\/]([^\\/]+)/i);
  if (!match) return null;
  const [, steamappsDir, folder] = match;
  let names;
  try {
    names = io.readdirSync(steamappsDir);
  } catch {
    return null;
  }
  for (const name of names) {
    const id = /^appmanifest_(\d+)\.acf$/i.exec(name)?.[1];
    if (!id) continue;
    try {
      const installDir = acfValue(io.readFileSync(path.join(steamappsDir, name), "utf8"), "installdir");
      if (installDir && installDir.toLowerCase() === folder.toLowerCase()) return id;
    } catch {
      /* unreadable manifest; keep looking */
    }
  }
  return null;
}

module.exports = { acfValue, steamAppState, steamRuntimeForLaunch, steamAppIdFromLibraryPath };
