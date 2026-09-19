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
  if (slug === "s-t-a-l-k-e-r-shadow-of-chernobyl" || slug === "lost-alpha" || slug === "stalker-lost-alpha") return true;
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

/**
 * Lost Alpha Developer's Cut XR_3DA.exe embeds a requireAdministrator manifest,
 * but __COMPAT_LAYER=RunAsInvoker suppresses that requirement cleanly without UAC.
 * Elevation is not needed and avoided so direct child tracking succeeds.
 */
function isLostAlphaElevatedLaunch(_launchPath, _gameSlug) {
  return false;
}

/**
 * Standard launch arguments for Lost Alpha.
 * -noprefetch prevents 32-bit address space exhaustion and crashes during loading.
 * -nospawncheck disables redundant all-spawn verification passes.
 */
function xrEngineDefaultArgs(launchPath, gameSlug) {
  const slug = String(gameSlug || "").toLowerCase();
  if (slug === "stalker-lost-alpha" || slug === "lost-alpha") {
    return ["-noprefetch", "-nospawncheck"];
  }
  const p = String(launchPath || "").toLowerCase();
  if (p.includes("lost alpha") && isXr3daClient(launchPath)) {
    return ["-noprefetch", "-nospawncheck"];
  }
  return [];
}

/**
 * Environment variables for X-Ray engine launches.
 * Sets __COMPAT_LAYER=RunAsInvoker to suppress manifest elevation demands on
 * user-directory installs when elevated launch is not used.
 */
function xrEngineEnvironment(launchPath, gameSlug) {
  if (process.platform !== "win32") return {};
  if (!isXrEngineLaunch(launchPath, gameSlug)) return {};
  return {
    __COMPAT_LAYER: "RunAsInvoker",
  };
}

module.exports = {
  isXr3daClient,
  isXrEngineLaunch,
  xrEnginePackageRoot,
  xrEngineWorkingDirectory,
  isLostAlphaElevatedLaunch,
  xrEngineDefaultArgs,
  xrEngineEnvironment,
};


