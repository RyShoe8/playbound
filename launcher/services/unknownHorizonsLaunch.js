/**
 * Unknown Horizons 2019.1 ships no game .exe — Inno installs to
 * C:\Unknown-Horizons and the Start Menu target is run_uh.bat, which starts
 * the bundled python with run_uh.py.
 *
 * PlayBound does not spawn .bat scripts generally (SHELL_LAUNCH_BLOCKED). This
 * resolves a detected bat/py/python path into a direct pythonw + script launch.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const UH_SLUG = "unknown-horizons";

function isUnknownHorizonsSlug(slug) {
  return String(slug || "").toLowerCase() === UH_SLUG;
}

/**
 * @param {string} launchPath
 * @param {string | null | undefined} [installDir]
 * @returns {{ exe: string, args: string[], cwd: string } | null}
 */
function resolveUnknownHorizonsLaunch(launchPath, installDir) {
  const p = String(launchPath || "");
  if (!p) return null;

  const candidates = [];
  const pushRoot = (root) => {
    if (!root) return;
    candidates.push(root);
  };

  pushRoot(installDir);
  pushRoot(path.dirname(p));
  pushRoot(path.dirname(path.dirname(p)));
  // bat/py live under …\unknown-horizons\; python under …\python\
  if (/unknown-horizons$/i.test(path.basename(path.dirname(p)))) {
    pushRoot(path.dirname(path.dirname(p)));
  }
  if (/[\\/]python$/i.test(path.dirname(p))) {
    pushRoot(path.dirname(path.dirname(p)));
  }
  pushRoot("C:\\Unknown-Horizons");

  for (const root of candidates) {
    const gameDir = path.join(root, "unknown-horizons");
    const script = path.join(gameDir, "run_uh.py");
    if (!fs.existsSync(script)) continue;
    const pythonw = path.join(root, "python", "pythonw.exe");
    const python = path.join(root, "python", "python.exe");
    const exe = fs.existsSync(pythonw) ? pythonw : fs.existsSync(python) ? python : null;
    if (!exe) continue;
    return { exe, args: [script], cwd: gameDir };
  }

  return null;
}

module.exports = {
  UH_SLUG,
  isUnknownHorizonsSlug,
  resolveUnknownHorizonsLaunch,
};
