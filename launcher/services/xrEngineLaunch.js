/**
 * S.T.A.L.K.E.R. X-Ray engines (SoC / Lost Alpha) keep XR_3DA under bin/ or
 * bins/ while resolving gamedata relative to the install root. Spawning with
 * cwd = dirname(exe) breaks asset load.
 */

const path = require("path");

const XR_BIN_DIR = /^(?:bin|bins)$/i;

function isXr3daClient(launchPath) {
  const base = path.basename(String(launchPath || "")).replace(/\.exe$/i, "");
  return /^XR_3DA$/i.test(base);
}

function isXrEngineLaunch(launchPath, gameSlug) {
  const slug = String(gameSlug || "").toLowerCase();
  if (slug === "s-t-a-l-k-e-r-shadow-of-chernobyl" || slug === "lost-alpha") return true;
  return isXr3daClient(launchPath);
}

function xrEnginePackageRoot(startDir) {
  let dir = startDir;
  if (XR_BIN_DIR.test(path.basename(dir))) {
    const parent = path.dirname(dir);
    if (parent && parent !== dir) return parent;
  }
  return dir;
}

/** Working directory for XR_3DA launches, or null when unrelated. */
function xrEngineWorkingDirectory(launchPath, gameSlug) {
  if (!isXrEngineLaunch(launchPath, gameSlug)) return null;
  return xrEnginePackageRoot(path.dirname(launchPath));
}

module.exports = {
  isXr3daClient,
  isXrEngineLaunch,
  xrEnginePackageRoot,
  xrEngineWorkingDirectory,
};
