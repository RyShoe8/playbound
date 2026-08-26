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

module.exports = { acfValue, steamAppState };
