/**
 * Which file in an install folder is the game.
 *
 * Windows' uninstall registry tells us where an installer put a game, and for
 * a recipe that names its executable that is the end of it. The gap is the
 * game that names nothing — a newly added catalog row with no knownExePaths —
 * where the folder is known, the .exe is sitting in it, and the launcher still
 * reports the install as not found because it was only ever looking for names
 * it had been given in advance.
 *
 * Two things make guessing safe enough to do:
 *
 * The rejects are absolute. An uninstaller, a bundled redistributable or a
 * crash reporter is never the game, and pointing Play at unins000.exe is worse
 * than finding nothing — it offers to remove the game the player just
 * installed.
 *
 * The accepts are conservative. A file has to look like the game by name, or
 * be the only plausible executable near the top of the folder. Anything else
 * is left for the player to pick by hand, which is a working outcome; a
 * confident wrong answer is not.
 *
 * Run: node services/exeCandidates.test.js
 */

/** Never the game, whatever else is in the folder. */
const NEVER_THE_GAME = [
  /^unins\d*\.exe$/i,
  /^uninstall(er)?\.exe$/i,
  /^uninst\.exe$/i,
  /^setup\.exe$/i,
  /^install(er)?\.exe$/i,
  /^vc_?redist.*\.exe$/i,
  /^dxsetup\.exe$/i,
  /^dotnet.*\.exe$/i,
  /^(ue4prereqsetup|oalinst|directx.*)\.exe$/i,
  /^crash(report|handler|pad).*\.exe$/i,
  /^.*(unins|uninstall).*\.exe$/i,
];

function baseName(file) {
  const parts = String(file || "").split(/[\\/]/);
  return parts[parts.length - 1] || "";
}

function depthOf(file) {
  return String(file || "").split(/[\\/]/).length - 1;
}

function isUninstallerExe(file) {
  const base = baseName(file);
  return NEVER_THE_GAME.some((re) => re.test(base));
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * @param {object} opts
 * @param {string[]} opts.files Paths relative to the install root, any depth.
 * @param {string[]} [opts.wanted] Basenames a recipe already named, tried first.
 * @param {string} [opts.title]
 * @param {string} [opts.slug]
 * @returns {string | null} one of `files`, or null to leave it to the player
 */
function chooseExeFromListing({ files = [], wanted = [], title = "", slug = "" } = {}) {
  const exes = files.filter((f) => /\.exe$/i.test(f));
  const byDepth = (a, b) => depthOf(a) - depthOf(b) || a.length - b.length;

  const want = new Set(wanted.map((w) => baseName(w).toLowerCase()).filter(Boolean));
  if (want.size) {
    const named = exes.filter((f) => want.has(baseName(f).toLowerCase())).sort(byDepth);
    if (named.length) return named[0];
  }

  const plausible = exes.filter((f) => !isUninstallerExe(f)).sort(byDepth);
  if (plausible.length === 0) return null;

  /*
   * A name that resembles the game. Both directions, because an installer
   * abbreviates as often as it elaborates: "7kaa.exe" for Seven Kingdoms,
   * "OpenRA.Launcher.exe" for OpenRA.
   */
  const wants = [norm(title), norm(slug)].filter((n) => n.length >= 4);
  const resembles = plausible.filter((f) => {
    const n = norm(baseName(f).replace(/\.exe$/i, ""));
    if (n.length < 3) return false;
    return wants.some((w) => w === n || w.startsWith(n) || n.startsWith(w) || w.includes(n) || n.includes(w));
  });
  if (resembles.length) return resembles[0];

  // Nothing looks like the title. One obvious executable near the top of the
  // folder is still a fair guess; a folder full of them is not.
  const shallow = plausible.filter((f) => depthOf(f) <= 1);
  if (shallow.length === 1) return shallow[0];

  return null;
}

module.exports = { chooseExeFromListing, isUninstallerExe, NEVER_THE_GAME };
