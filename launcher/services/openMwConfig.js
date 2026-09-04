/**
 * Point an OpenMW-family install at the player's Morrowind data.
 *
 * OpenMW, TES3MP and their relatives ship an engine and no game. They read
 * `openmw.cfg` for a `data=` directory holding Morrowind's Data Files and one
 * `content=` line per master. Without those the client prints
 *
 *     No content file given (esm/esp, nor omwgame/omwaddon). Aborting...
 *
 * and exits before opening a window — which reaches the player as PlayBound
 * saying the game "exited immediately after launch", a message that sends them
 * off checking GPU drivers for a config problem.
 *
 * The edition already told us this would happen: TES3MP's recipe carries
 * `requirements.notes: "Requires legal Morrowind Game of the Year game files."`
 * Nothing acted on it. This is the part that acts on it.
 *
 * PlayBound does not ship the data. This only writes the path to a copy the
 * player already owns.
 */

"use strict";

const path = require("path");

/** Masters, in the load order Morrowind expects. Expansions are optional. */
const MORROWIND_MASTERS = ["Morrowind.esm", "Tribunal.esm", "Bloodmoon.esm"];

/**
 * True when this install is an OpenMW-family engine.
 *
 * Keyed on the config file rather than a list of edition slugs, so OpenMW,
 * TES3MP, a VR respin and anything else built on the engine are all covered
 * without being enumerated.
 */
function isOpenMwInstall(gameDir, exists) {
  if (!gameDir) return false;
  return exists(path.join(gameDir, "openmw.cfg"));
}

/**
 * Does the config still lack game data?
 *
 * A `content=` line is the thing the engine actually aborts over, so that is
 * what is checked — not `data=`, which the stock config already has three of,
 * all pointing at the engine's own empty folders.
 */
function needsMorrowindData(cfgText) {
  return !/^\s*content\s*=/m.test(String(cfgText || ""));
}

/**
 * The masters present in a Data Files directory, in load order.
 *
 * Returns an empty list when Morrowind.esm is absent: Tribunal and Bloodmoon
 * are expansions and cannot load on their own, so a directory with only those
 * is not a Morrowind install and writing it would swap one abort for another.
 */
function mastersIn(dataDir, exists) {
  const found = MORROWIND_MASTERS.filter((name) => exists(path.join(dataDir, name)));
  return found.includes("Morrowind.esm") ? found : [];
}

/**
 * The config with the data directory and its masters appended.
 *
 * Appended rather than rewritten. openmw.cfg holds hundreds of `fallback=`
 * lines defining the game's weather, levelling and UI colours; regenerating it
 * to insert two entries would be a large edit to make a small change, and any
 * of the player's own settings would go with it.
 */
function withMorrowindData(cfgText, dataDir, masters) {
  const body = String(cfgText || "").replace(/\s*$/, "");
  const lines = [
    "",
    "",
    "# Added by PlayBound: the licensed Morrowind data this engine needs.",
    `data="${dataDir}"`,
    ...masters.map((m) => `content=${m}`),
    "",
  ];
  return `${body}\n${lines.join("\n")}`;
}

/**
 * Directories worth checking for a Morrowind install, most specific first.
 *
 * `extra` is where a caller passes what it already knows — a Steam library
 * hit, or a folder the player picked — so this stays a plain list and the
 * lookups that need the registry or the filesystem live with their callers.
 */
function morrowindDataCandidates({ extra = [], programFiles = [], drives = [] } = {}) {
  const roots = [
    ...extra,
    ...programFiles.flatMap((p) => [
      path.join(p, "Bethesda Softworks", "Morrowind"),
      path.join(p, "GOG Galaxy", "Games", "Morrowind"),
    ]),
    ...drives.flatMap((d) => [
      path.join(d, "GOG", "Morrowind"),
      path.join(d, "GOG Games", "Morrowind"),
      path.join(d, "Games", "Morrowind"),
      path.join(d, "Morrowind"),
    ]),
  ];
  // Both shapes appear in the wild: the install root, and the Data Files dir
  // itself when someone points us straight at it.
  return roots.flatMap((root) => [path.join(root, "Data Files"), root]);
}

/** First candidate that really holds Morrowind, with the masters it has. */
function resolveMorrowindData(candidates, exists) {
  for (const dir of candidates) {
    const masters = mastersIn(dir, exists);
    if (masters.length > 0) return { dataDir: dir, masters };
  }
  return null;
}

module.exports = {
  MORROWIND_MASTERS,
  isOpenMwInstall,
  needsMorrowindData,
  mastersIn,
  withMorrowindData,
  morrowindDataCandidates,
  resolveMorrowindData,
};
