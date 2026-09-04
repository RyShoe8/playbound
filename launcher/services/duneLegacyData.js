/**
 * Whether Dune Legacy can find the original game data it needs to start.
 *
 * Dune Legacy is an engine reimplementation, not a complete game: it ships
 * without Westwood's assets and refuses to run until at least one of the
 * original PAK files is somewhere it looks. The launcher checks this before
 * Play so the failure is a message about missing data rather than a window
 * that opens and immediately closes.
 *
 * Lifted out of main.js unchanged. It reaches for nothing but fs, path and
 * APPDATA, which is what made it worth moving — the check is now testable
 * without booting Electron.
 */

const fs = require("node:fs");
const path = require("node:path");

/** Directories Dune Legacy will look in, in the order it looks. */
function pakSearchRoots(exePath, dir) {
  const roots = [];
  const base = dir || (exePath ? path.dirname(exePath) : null);
  if (base) {
    roots.push(base);
    roots.push(path.join(base, "data"));
  }
  if (process.env.APPDATA) {
    roots.push(path.join(process.env.APPDATA, "dunelegacy", "data"));
  }
  return roots;
}

/** True when Dune Legacy can find at least one required original PAK. */
function duneLegacyHasPakData(exePath, dir) {
  for (const root of pakSearchRoots(exePath, dir)) {
    try {
      if (fs.existsSync(path.join(root, "DUNE.PAK")) || fs.existsSync(path.join(root, "ATRE.PAK"))) {
        return true;
      }
    } catch {
      /* An unreadable root is not a match; keep looking. */
    }
  }
  return false;
}

module.exports = { duneLegacyHasPakData, pakSearchRoots };
