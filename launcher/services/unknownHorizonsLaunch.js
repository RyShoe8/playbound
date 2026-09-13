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
 * @returns {{ exe: string, args: string[], cwd: string, env?: Record<string, string> } | null}
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
    const pythonDir = path.join(root, "python");
    const pythonw = path.join(pythonDir, "pythonw.exe");
    const python = path.join(pythonDir, "python.exe");
    /*
     * Prefer python.exe over pythonw so launch failures surface in logs the
     * way the official run_uh.bat does. pythonw hides the console and made
     * FIFE DLL errors look like an immediate silent exit.
     */
    const exe = fs.existsSync(python) ? python : fs.existsSync(pythonw) ? pythonw : null;
    if (!exe) continue;
    /*
     * FIFE ships SDL_image + libpng beside the Python package. Without that
     * directory on PATH, Windows reports "Failed loading libpng16-16.dll" and
     * the process dies during engine init — even though the DLL is installed.
     */
    const fifeDir = path.join(pythonDir, "Lib", "site-packages", "fife");
    const pathPrefix = [fifeDir, pythonDir].filter((dir) => fs.existsSync(dir));
    const env =
      pathPrefix.length > 0
        ? {
            PATH: `${pathPrefix.join(path.delimiter)}${path.delimiter}${process.env.PATH || ""}`,
          }
        : undefined;
    return {
      exe,
      args: [script, "--debug-log-only"],
      cwd: gameDir,
      env,
    };
  }

  return null;
}

module.exports = {
  UH_SLUG,
  isUnknownHorizonsSlug,
  resolveUnknownHorizonsLaunch,
};
