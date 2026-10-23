"use strict";

/**
 * Daggerfall Online and Daggerfall Unity are engines: neither ships Daggerfall's
 * own game files. They find them on the machine, so a player who installs one of
 * them without the base game first gets a program that opens and asks for a
 * folder. This is the part of "install the base game first" that can be decided
 * without touching Electron: which editions need the files, and whether any copy
 * of them is already on this PC.
 */

/** Editions that run on Daggerfall's data but do not bring it with them. */
const EDITIONS_NEEDING_BASE_FILES = Object.freeze(["daggerfall-online", "daggerfall-unity"]);

/** The edition that is the game itself (Bethesda's freeware release). */
const BASE_EDITION = "classic-dos";

const NAMES = Object.freeze({
  "daggerfall-online": "Daggerfall Online",
  "daggerfall-unity": "Daggerfall Unity",
});

function needsBaseFiles(slug, editionSlug) {
  return slug === "daggerfall" && EDITIONS_NEEDING_BASE_FILES.includes(String(editionSlug || ""));
}

function editionTitle(editionSlug) {
  return NAMES[String(editionSlug || "")] || "this edition";
}

/**
 * First complete ARENA2 folder at or below `dir`, to a small depth.
 *
 * Stores and installers nest the game differently (GOG: `DAGGER/ARENA2`, Steam:
 * `DFCD/DAGGER/ARENA2`, a plain copy: `ARENA2`), and the case varies, so look for
 * the folder by name instead of by one fixed path.
 */
function findCompleteArena2(fs, path, dir, missingArena2, depth = 3) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);
    if (entry.name.toUpperCase() === "ARENA2") {
      if (missingArena2(fs, child)?.length === 0 && entriesAreComplete(fs, path, child)) return child;
      continue;
    }
    if (depth > 0) {
      const found = findCompleteArena2(fs, path, child, missingArena2, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function entriesAreComplete(fs, path, arena2Dir) {
  try {
    return fs.readdirSync(arena2Dir).some((name) => name.toUpperCase() === "DAGGER.SND" && fs.statSync(path.join(arena2Dir, name)).size > 0);
  } catch {
    return false;
  }
}

/**
 * Whether a usable copy of Daggerfall's files is already on this PC.
 *
 * `roots` is every folder worth looking under: the PlayBound games folder, the
 * base edition's install folder, and each Steam library's `common` folder. Only a
 * folder that is actually complete counts; a half-extracted ARENA2 is not "present".
 */
function baseFilesPresent({ fs, path, roots, missingArena2 }) {
  for (const root of roots) {
    if (!root) continue;
    if (findCompleteArena2(fs, path, root, missingArena2)) return true;
  }
  return false;
}

module.exports = {
  EDITIONS_NEEDING_BASE_FILES,
  BASE_EDITION,
  needsBaseFiles,
  editionTitle,
  findCompleteArena2,
  baseFilesPresent,
};
