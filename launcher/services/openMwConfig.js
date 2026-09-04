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
 * The BSA archives, in the same order as the masters.
 *
 * `content=` alone gets the engine as far as loading the world, which is why
 * missing these does not look like a config problem: the game starts. But
 * every texture, mesh, font and UI element lives inside these archives, and
 * OpenMW only reads a BSA that is named by a `fallback-archive=` line. Without
 * them the engine substitutes its magenta placeholder for every texture it
 * cannot find — including the menu backgrounds and button faces, so the main
 * menu comes up as unreadable pink boxes.
 *
 * The community answer to this is "run the TES3MP wizard", which is really
 * just a person doing what this file does.
 */
const MORROWIND_ARCHIVES = ["Morrowind.bsa", "Tribunal.bsa", "Bloodmoon.bsa"];

/**
 * SDL controller mappings the engine's own database is too old to have.
 *
 * TES3MP bundles SDL 2.0.12, released in March 2020; the DualSense arrived
 * that November. So SDL sees the pad, fails to recognise it as a game
 * controller, and the client log says
 *
 *     Detected unusable controller: DualSense Wireless Controller
 *
 * while a pad SDL does know about on the same machine is "Detected game
 * controller". `enable controller = true` cannot fix that on its own — the
 * engine has nothing to map the axes and buttons onto.
 *
 * OpenMW reads gamecontrollerdb.txt out of its user config directory in
 * addition to the copy it ships, which is the supported way to add a pad
 * without touching the install.
 *
 * The GUIDs are SDL's Windows form: bus, then vendor and product byte-swapped.
 * 054c/0ce6 is Sony's DualSense — 0300 over USB, 0500 over Bluetooth, which
 * enumerate as different devices and so need a line each.
 */
const CONTROLLER_MAPPINGS = [
  "030000004c050000e60c000000000000,PS5 Controller,a:b1,b:b2,back:b8,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,guide:b12,leftshoulder:b4,leftstick:b10,lefttrigger:a3,leftx:a0,lefty:a1,rightshoulder:b5,rightstick:b11,righttrigger:a4,rightx:a2,righty:a5,start:b9,x:b0,y:b3,platform:Windows,",
  "050000004c050000e60c000000000000,PS5 Controller,a:b1,b:b2,back:b8,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,guide:b12,leftshoulder:b4,leftstick:b10,lefttrigger:a3,leftx:a0,lefty:a1,rightshoulder:b5,rightstick:b11,righttrigger:a4,rightx:a2,righty:a5,start:b9,x:b0,y:b3,platform:Windows,",
];

/** The GUID at the head of an SDL mapping line, or null for a comment. */
function mappingGuid(line) {
  const m = /^([0-9a-f]{32}),/i.exec(String(line || "").trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Mappings not already present, matched on GUID rather than whole line.
 *
 * A player who added their own line for the same pad keeps it: theirs is
 * already the answer to the question this file exists to answer, and SDL takes
 * the first match anyway.
 */
function missingControllerMappings(dbText, mappings = CONTROLLER_MAPPINGS) {
  const have = new Set(
    String(dbText || "")
      .split(/\r?\n/)
      .map(mappingGuid)
      .filter(Boolean)
  );
  return mappings.filter((line) => !have.has(mappingGuid(line)));
}

/** The database with the given mappings appended. */
function withControllerMappings(dbText, mappings) {
  if (!mappings.length) return String(dbText || "");
  const body = String(dbText || "").replace(/\s*$/, "");
  const block = ["# Added by PlayBound: pads newer than this engine's SDL.", ...mappings, ""];
  return body ? `${body}\n${block.join("\n")}` : block.join("\n");
}

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
function withMorrowindData(cfgText, dataDir, masters, archives = []) {
  const body = String(cfgText || "").replace(/\s*$/, "");
  const lines = [
    "",
    "",
    "# Added by PlayBound: the licensed Morrowind data this engine needs.",
    `data="${dataDir}"`,
    // Archives before content: without these the world loads and every
    // texture, including the menus, renders as a pink placeholder.
    ...archives.map((a) => `fallback-archive=${a}`),
    ...masters.map((m) => `content=${m}`),
    "",
  ];
  return `${body}\n${lines.join("\n")}`;
}

/** The archives present in a Data Files directory, in load order. */
function archivesIn(dataDir, exists) {
  return MORROWIND_ARCHIVES.filter((name) => exists(path.join(dataDir, name)));
}

/**
 * Data directories the config already names.
 *
 * Used by the repair path: an install configured before archives were written
 * has a good `data=` line and needs only the `fallback-archive=` lines, so
 * there is no reason to go looking for Morrowind on disk a second time.
 */
function dataDirsIn(cfgText) {
  const out = [];
  const re = /^\s*data\s*=\s*"?([^"\r\n]+?)"?\s*$/gm;
  let m;
  while ((m = re.exec(String(cfgText || "")))) out.push(m[1]);
  return out;
}

/** Archives that exist on disk but are not yet named by the config. */
function missingArchives(cfgText, dataDir, exists) {
  const text = String(cfgText || "");
  return archivesIn(dataDir, exists).filter(
    (name) => !new RegExp(`^\\s*fallback-archive\\s*=\\s*${name}\\s*$`, "im").test(text)
  );
}

/**
 * The config with archive lines appended and nothing else touched.
 *
 * The repair for an install that PlayBound already pointed at Morrowind before
 * this file knew about BSAs — the player has a working `data=` and `content=`
 * and a pink main menu, and reinstalling to fix it would be a poor answer.
 */
function withMorrowindArchives(cfgText, archives) {
  if (!archives.length) return String(cfgText || "");
  const body = String(cfgText || "").replace(/\s*$/, "");
  const lines = [
    "",
    "",
    "# Added by PlayBound: Morrowind's texture and mesh archives.",
    ...archives.map((a) => `fallback-archive=${a}`),
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
    if (masters.length > 0) return { dataDir: dir, masters, archives: archivesIn(dir, exists) };
  }
  return null;
}

module.exports = {
  MORROWIND_MASTERS,
  MORROWIND_ARCHIVES,
  CONTROLLER_MAPPINGS,
  mappingGuid,
  missingControllerMappings,
  withControllerMappings,
  isOpenMwInstall,
  needsMorrowindData,
  mastersIn,
  archivesIn,
  dataDirsIn,
  missingArchives,
  withMorrowindData,
  withMorrowindArchives,
  morrowindDataCandidates,
  resolveMorrowindData,
};
