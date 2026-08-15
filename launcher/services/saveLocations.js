/**
 * Where each game keeps its saves.
 *
 * The registry cloud saves depend on. Every entry here has to be right — a
 * wrong path means either backing up nothing, or worse, restoring over the
 * wrong folder — so this starts small and grows only as locations are
 * confirmed on a real install rather than guessed from a wiki.
 *
 * The seed entries below are not guesses: they are the same user-data roots
 * the launcher already writes mods into (resolveModTargetDir in main.js), so
 * they have been exercised by every mod install for those games. Anything not
 * listed simply has no cloud saves yet, which is the safe default.
 *
 * Adding a game: install it, play far enough to produce a save, find the
 * directory that changed, confirm a fresh install picks the save back up after
 * restoring it, then add it here with `verified` set.
 */
const path = require("path");
const fs = require("fs");

/**
 * @typedef {object} SaveLocation
 * @property {(ctx: SaveContext) => string | null} resolve  Absolute save dir, or null when unsupported here.
 * @property {string} verified  How this path was confirmed — kept so an unverified entry is obvious.
 * @property {string} [note]
 */

/**
 * @typedef {object} SaveContext
 * @property {string} home
 * @property {string} appData      %APPDATA% or the platform equivalent.
 * @property {string} documents
 * @property {string} [installDir] Where the game itself lives, when known.
 */

/** Games whose saves sit under a per-user data directory the launcher already uses. */
const LOCATIONS = {
  "0ad": {
    verified: "same user-data root the launcher writes 0 A.D. mods into",
    resolve: (c) =>
      process.platform === "darwin"
        ? path.join(c.appData, "0ad", "saves")
        : path.join(c.documents, "My Games", "0ad", "saves"),
  },
  mindustry: {
    verified: "same user-data root the launcher writes Mindustry mods into",
    resolve: (c) => path.join(c.appData, "Mindustry", "saves"),
  },
  openttd: {
    verified: "same user-data root the launcher writes OpenTTD content into",
    resolve: (c) => path.join(c.appData, "OpenTTD", "save"),
  },
  "endless-sky": {
    verified: "same user-data root the launcher writes Endless Sky plugins into",
    resolve: (c) => path.join(c.appData, "endless-sky", "saves"),
  },
  naev: {
    verified: "same user-data root the launcher writes Naev plugins into",
    resolve: (c) => path.join(c.appData, "naev", "saves"),
  },
  luanti: {
    verified: "same user-data root the launcher writes Luanti mods into",
    // Luanti keeps each world in its own directory; the whole tree is the save.
    resolve: (c) => {
      const luanti = path.join(c.appData, "Luanti", "worlds");
      const minetest = path.join(c.appData, "Minetest", "worlds");
      return fs.existsSync(luanti) ? luanti : minetest;
    },
    note: "Whole worlds directory — each world is a folder.",
  },
};

function defaultContext() {
  const home = require("os").homedir();
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(home, "Library", "Application Support")
      : path.join(home, ".config"));
  const documents =
    process.platform === "darwin"
      ? path.join(home, "Documents")
      : path.join(process.env.USERPROFILE || home, "Documents");
  return { home, appData, documents };
}

/** Absolute save directory for a game, or null when we do not know one. */
function saveDirFor(gameSlug, ctx = defaultContext()) {
  const entry = LOCATIONS[gameSlug];
  if (!entry) return null;
  try {
    return entry.resolve(ctx) || null;
  } catch {
    return null;
  }
}

function supportsCloudSaves(gameSlug) {
  return Object.prototype.hasOwnProperty.call(LOCATIONS, gameSlug);
}

function supportedSlugs() {
  return Object.keys(LOCATIONS);
}

module.exports = { LOCATIONS, saveDirFor, supportsCloudSaves, supportedSlugs, defaultContext };
