/**
 * SaveData — snapshotting and restoring a game's save files.
 *
 * The engine underneath cloud saves. Kept deliberately separate from any
 * upload/download concern so the dangerous half — touching files a player
 * cannot replace — can be reasoned about and tested on its own.
 *
 * Three rules shape everything here, because a save-sync bug is worse than no
 * save sync at all:
 *
 *   1. Restoring never destroys. The current saves are snapshotted first, so
 *      "restore the wrong one" is always undoable.
 *   2. Snapshots are immutable and versioned. Nothing overwrites a snapshot in
 *      place; a bad game write cannot corrupt history retroactively.
 *   3. Nothing is written outside the snapshot root or the save directory the
 *      registry named. Paths from archives are validated before extraction.
 *
 * Snapshots live under userData/saves/<gameKey>/<timestamp>/ as plain copied
 * files rather than an archive, so a player can always recover by hand with a
 * file manager even if PlayBound will not start.
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

/** Keep this many snapshots per game before pruning the oldest. */
const DEFAULT_KEEP = 10;

/** Ignore caches and logs — they bloat snapshots and are never worth restoring. */
const SKIP_ENTRIES = new Set([
  "cache",
  "caches",
  "logs",
  "log",
  "crashes",
  "crashreports",
  "temp",
  "tmp",
  ".git",
]);

function normalize(p) {
  return path.resolve(String(p || ""));
}

/** True when `child` is inside `root` (or is `root`). */
function isInside(child, root) {
  const rel = path.relative(normalize(root), normalize(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** A filesystem-safe key for a game+edition pair. */
function snapshotKey(gameSlug, editionSlug) {
  const raw = `${gameSlug}__${editionSlug || "official"}`;
  return raw.replace(/[^a-z0-9_.-]/gi, "_");
}

/**
 * Snapshot ids sort lexicographically in chronological order.
 *
 * ISO with the colons removed: filesystem-safe on Windows and still sortable
 * as text, which keeps "newest" a string comparison rather than a stat call
 * per directory.
 */
function newSnapshotId(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

async function pathExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Total size of a tree, in bytes, applying the same skip rules as the copy.
 *
 * Measured before copying rather than after: discovering a save is too large
 * only once four gigabytes are already on disk defeats the point of a limit.
 * Stops early once `limitBytes` is exceeded, so an enormous directory costs a
 * partial walk rather than a full one.
 */
async function measureTree(dir, { skip = SKIP_ENTRIES, limitBytes = Infinity } = {}) {
  let total = 0;
  async function walk(current) {
    if (total > limitBytes) return;
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (total > limitBytes) return;
      if (skip.has(entry.name.toLowerCase())) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        try {
          total += (await fsp.stat(full)).size;
        } catch {
          /* unreadable file: ignore rather than fail the measurement */
        }
      }
    }
  }
  await walk(dir);
  return total;
}

/** Recursively copy `from` into `to`, skipping caches. Returns files copied. */
async function copyTree(from, to, { skip = SKIP_ENTRIES } = {}) {
  let count = 0;
  let bytes = 0;
  const entries = await fsp.readdir(from, { withFileTypes: true });
  await fsp.mkdir(to, { recursive: true });
  for (const entry of entries) {
    if (skip.has(entry.name.toLowerCase())) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      const nested = await copyTree(src, dest, { skip });
      count += nested.files;
      bytes += nested.bytes;
    } else if (entry.isFile()) {
      await fsp.copyFile(src, dest);
      count += 1;
      try {
        bytes += (await fsp.stat(dest)).size;
      } catch {
        /* size is informational */
      }
    }
    // Symlinks are intentionally skipped: following one could copy from, or
    // later write to, somewhere outside the save directory entirely.
  }
  return { files: count, bytes };
}

function createSaveData({ snapshotRoot }) {
  const root = normalize(snapshotRoot);

  function gameRoot(gameSlug, editionSlug) {
    return path.join(root, snapshotKey(gameSlug, editionSlug));
  }

  /**
   * Copy a game's current saves into a new immutable snapshot.
   *
   * `reason` is recorded so history is readable later — a snapshot taken to
   * protect a restore reads differently from one the player asked for.
   */
  async function snapshot(
    gameSlug,
    editionSlug,
    saveDir,
    { reason = "manual", now = new Date(), maxSnapshotMb = null } = {}
  ) {
    const source = normalize(saveDir);
    if (!(await pathExists(source))) {
      return { status: "no-saves", saveDir: source };
    }
    const stat = await fsp.stat(source);
    if (!stat.isDirectory()) return { status: "no-saves", saveDir: source };

    if (maxSnapshotMb != null && Number.isFinite(maxSnapshotMb)) {
      const limitBytes = maxSnapshotMb * 1024 * 1024;
      const size = await measureTree(source, { limitBytes });
      if (size > limitBytes) {
        // Reported rather than thrown: an oversized save is a normal outcome
        // for sandbox games, not an error the player did something to cause.
        return {
          status: "too-large",
          saveDir: source,
          bytes: size,
          limitBytes,
        };
      }
    }

    const id = newSnapshotId(now);
    const dest = path.join(gameRoot(gameSlug, editionSlug), id);
    // Never let a crafted slug escape the snapshot root.
    if (!isInside(dest, root)) throw new Error("Refusing to write a snapshot outside the save root");

    const { files, bytes } = await copyTree(source, dest);
    if (files === 0) {
      // An empty snapshot is noise in the history and would happily overwrite
      // real saves if restored, so it is removed rather than recorded.
      await fsp.rm(dest, { recursive: true, force: true });
      return { status: "no-saves", saveDir: source };
    }

    await fsp.writeFile(
      path.join(dest, ".playbound-snapshot.json"),
      JSON.stringify(
        { id, gameSlug, editionSlug: editionSlug || "official", reason, files, bytes, createdAt: now.toISOString(), source },
        null,
        2
      ),
      "utf8"
    );

    return { status: "captured", id, files, bytes, dir: dest };
  }

  /** Snapshots for a game, newest first. */
  async function list(gameSlug, editionSlug) {
    const dir = gameRoot(gameSlug, editionSlug);
    if (!(await pathExists(dir))) return [];
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const snapshots = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let meta = null;
      try {
        meta = JSON.parse(
          await fsp.readFile(path.join(dir, entry.name, ".playbound-snapshot.json"), "utf8")
        );
      } catch {
        // A snapshot without readable metadata is still restorable; surface it
        // rather than hiding a directory the player can see on disk.
        meta = { id: entry.name };
      }
      snapshots.push({ ...meta, id: meta.id || entry.name, dir: path.join(dir, entry.name) });
    }
    return snapshots.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }

  /**
   * Replace the live saves with a snapshot's contents.
   *
   * Takes a safety snapshot of whatever is currently there first, so this is
   * always reversible — the single most important behaviour in this file.
   */
  async function restore(gameSlug, editionSlug, saveDir, snapshotId, { now = new Date() } = {}) {
    const target = normalize(saveDir);
    const from = path.join(gameRoot(gameSlug, editionSlug), snapshotId);
    if (!isInside(from, root)) throw new Error("Refusing to restore from outside the save root");
    if (!(await pathExists(from))) throw new Error(`Snapshot ${snapshotId} not found`);

    const safety = await snapshot(gameSlug, editionSlug, target, {
      reason: `pre-restore:${snapshotId}`,
      now,
    });

    await fsp.mkdir(target, { recursive: true });
    const { files } = await copyTree(from, target, {
      // The metadata file belongs to the snapshot, not the game.
      skip: new Set([...SKIP_ENTRIES, ".playbound-snapshot.json"]),
    });

    return {
      status: "restored",
      restored: snapshotId,
      files,
      safetySnapshot: safety.status === "captured" ? safety.id : null,
    };
  }

  /** Drop the oldest snapshots beyond `keep`, newest always retained. */
  async function prune(gameSlug, editionSlug, keep = DEFAULT_KEEP) {
    const snapshots = await list(gameSlug, editionSlug);
    const excess = snapshots.slice(Math.max(1, keep));
    for (const s of excess) {
      if (!isInside(s.dir, root)) continue;
      await fsp.rm(s.dir, { recursive: true, force: true });
    }
    return { removed: excess.map((s) => s.id), kept: snapshots.length - excess.length };
  }

  return { snapshot, list, restore, prune, gameRoot };
}

module.exports = {
  createSaveData,
  snapshotKey,
  newSnapshotId,
  isInside,
  measureTree,
  SKIP_ENTRIES,
  DEFAULT_KEEP,
};
