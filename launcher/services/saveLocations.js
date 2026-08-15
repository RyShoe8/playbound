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

/**
 * Local snapshots are deliberately unlimited.
 *
 * They live on the player's own disk and cost PlayBound nothing, and they are
 * what makes a bad restore recoverable — so capping them would trade away the
 * safety guarantee to save storage that is not ours. A Luanti player with a
 * large world still gets full local history.
 *
 * The limits that matter are on what gets *uploaded*; see CLOUD_POLICY.
 */
const DEFAULT_MAX_SNAPSHOT_MB = Infinity;
const DEFAULT_KEEP_LOCAL = Infinity;

/**
 * What free accounts may store in the cloud.
 *
 * This is the half PlayBound pays for in storage and egress, so it is capped
 * where local history is not: one snapshot per game, and a size ceiling applied
 * by measured bytes rather than by game, because a Mindustry player with
 * hundreds of schematics can outgrow a casual Luanti world.
 *
 * Raised for subscribers once that ships — hence a named policy rather than
 * constants scattered through the sync path.
 */
const CLOUD_POLICY = {
  free: { maxSnapshotMb: 250, keepPerGame: 1 },
};

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
    note: "Whole worlds directory — each world is a folder, and they grow without limit.",
  },

  /* ── Documented from upstream, not yet exercised on a real install ──────
   * The entries above are proven: they are the same user-data roots the
   * launcher already writes mods into. The ones below come from upstream
   * documentation instead, so they are marked as such — a wrong path here
   * mostly yields "no-saves", and SaveData refuses anything resolving to a
   * home or system root, but they are worth confirming as each game is played.
   */
  "battle-for-wesnoth": {
    verified: "documented — Wesnoth user data directory",
    // Version-stamped: Wesnoth1.18, Wesnoth1.20…
    resolve: (c) => {
      const parent = path.join(c.documents, "My Games");
      const versioned = newestMatchingDir(parent, /^Wesnoth[\d.]+$/i);
      return versioned ? path.join(versioned, "saves") : null;
    },
  },
  "warzone-2100": {
    verified: "documented — Warzone 2100 Project user data directory",
    resolve: (c) => {
      const parent = path.join(c.appData, "Warzone 2100 Project");
      const versioned = newestMatchingDir(parent, /^Warzone 2100/i);
      return versioned ? path.join(versioned, "savegames") : null;
    },
  },
  openra: {
    verified: "documented — OpenRA support directory",
    resolve: (c) => path.join(c.documents, "OpenRA", "Saves"),
  },
  freeciv: {
    verified: "documented — Freeciv save directory",
    resolve: (c) => path.join(c.appData, "freeciv", "saves"),
  },
  hedgewars: {
    verified: "documented — Hedgewars user data directory",
    resolve: (c) => path.join(c.documents, "Hedgewars", "Saves"),
  },
  supertux: {
    verified: "documented — SuperTux profile directory",
    resolve: (c) => path.join(c.appData, "SuperTux2"),
  },
  "shattered-pixel-dungeon": {
    verified: "documented — libGDX user directory used by the desktop build",
    resolve: (c) => path.join(c.home, ".shatteredpixel", "shattered-pixel-dungeon"),
  },
  holocure: {
    verified: "documented — GameMaker local app data directory",
    resolve: (c) => path.join(c.localAppData || c.appData, "HoloCure"),
  },
};

/**
 * Games with no local saves to protect.
 *
 * Recorded rather than left absent so nobody adds them later assuming an
 * oversight. In each of these, progress lives on someone else's server: there
 * is nothing on disk that restoring could bring back, and pretending otherwise
 * would be a worse promise than saying nothing.
 */
const NO_LOCAL_SAVES = {
  everquest: "Character data is stored server-side by Daybreak or the emulator.",
  warframe: "Account progress is server-side.",
  "villagers-and-heroes": "Account progress is server-side.",
  "asphalt-legends": "Live-service account progress is server-side.",
  xonotic: "Keeps configs and demos, not save games.",
  unvanquished: "Keeps configs and demos, not save games.",
  "beyond-all-reason": "Matches are server-side; local data is replays and settings.",
  "zero-k": "Matches are server-side; local data is replays and settings.",
};

/**
 * Newest child of `parent` whose name matches `pattern`.
 *
 * Several games stamp the version into their user-data folder — Wesnoth uses
 * "Wesnoth1.18", Warzone "Warzone 2100 4.7" — so a hardcoded path silently
 * stops finding saves the moment the game updates. Picking the newest match
 * follows the player forward instead.
 */
function newestMatchingDir(parent, pattern) {
  try {
    const entries = fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && pattern.test(e.name))
      .map((e) => {
        const full = path.join(parent, e.name);
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch {
          /* unreadable: sorts last */
        }
        return { full, name: e.name, mtime };
      });
    if (!entries.length) return null;
    // Prefer the most recently touched, which is the version being played.
    entries.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
    return entries[0].full;
  } catch {
    return null;
  }
}

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
  const localAppData = process.env.LOCALAPPDATA || appData;
  return { home, appData, documents, localAppData };
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

/**
 * Local retention for a game. Unlimited unless a game opts into a limit,
 * because this storage belongs to the player, not to us.
 */
function policyFor(gameSlug) {
  const entry = LOCATIONS[gameSlug];
  return {
    maxSnapshotMb: entry?.maxSnapshotMb ?? DEFAULT_MAX_SNAPSHOT_MB,
    keep: entry?.keep ?? DEFAULT_KEEP_LOCAL,
  };
}

/**
 * Whether a snapshot is small enough to upload on a given plan.
 *
 * Decided on measured bytes rather than on which game produced them: size is
 * the thing that costs money, and no game is reliably small or reliably large.
 */
function cloudPolicyFor(plan = "free") {
  return CLOUD_POLICY[plan] ?? CLOUD_POLICY.free;
}

function canUploadSnapshot(bytes, plan = "free") {
  const { maxSnapshotMb } = cloudPolicyFor(plan);
  return bytes <= maxSnapshotMb * 1024 * 1024;
}

function supportedSlugs() {
  return Object.keys(LOCATIONS);
}

/** Why a game has no save backups, when that is deliberate rather than pending. */
function noLocalSavesReason(gameSlug) {
  return NO_LOCAL_SAVES[gameSlug] || null;
}

module.exports = {
  LOCATIONS,
  NO_LOCAL_SAVES,
  noLocalSavesReason,
  newestMatchingDir,
  saveDirFor,
  supportsCloudSaves,
  supportedSlugs,
  defaultContext,
  policyFor,
  cloudPolicyFor,
  canUploadSnapshot,
  CLOUD_POLICY,
  DEFAULT_MAX_SNAPSHOT_MB,
};
