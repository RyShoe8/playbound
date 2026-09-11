/**
 * AssaultCube keeps ac_client under bin_* while resolving packages/ relative
 * to the install root. Spawning from the bin folder yields:
 * "could not find core textures — hunt / run assaultcube from the parent of
 * the bin directory".
 */

const path = require("path");

const ASSAULTCUBE_BIN_DIR =
  /^(?:bin|bin_win32|bin_win64|bin_unix|bin32|bin64|x64|x86|amd64|i386)$/i;

function isAssaultCubeClient(launchPath) {
  const base = path.basename(String(launchPath || "")).replace(/\.(exe|app)$/i, "");
  return /^ac_client$/i.test(base);
}

function isAssaultCubeLaunch(launchPath, gameSlug) {
  return String(gameSlug || "").toLowerCase() === "assaultcube" || isAssaultCubeClient(launchPath);
}

/** Walk out of bin / nested arch folders to the tree that holds packages/. */
function assaultCubePackageRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 3; i++) {
    if (!ASSAULTCUBE_BIN_DIR.test(path.basename(dir))) break;
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return dir;
}

/**
 * Working directory for AssaultCube, or null when this launch is unrelated.
 * Callers that are not AssaultCube keep their own cwd logic.
 */
function assaultCubeWorkingDirectory(launchPath, gameSlug) {
  if (!isAssaultCubeLaunch(launchPath, gameSlug)) return null;
  return assaultCubePackageRoot(path.dirname(launchPath));
}

module.exports = {
  isAssaultCubeClient,
  isAssaultCubeLaunch,
  assaultCubePackageRoot,
  assaultCubeWorkingDirectory,
};
