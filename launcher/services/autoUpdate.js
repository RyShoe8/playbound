"use strict";
const fs = require("node:fs");
const path = require("node:path");

/**
 * Keeping installed editions and mods current without losing what is in them.
 *
 * An update replaces the whole install folder, and older portable games keep
 * saves and settings right beside the executable. So anything the player's copy
 * did not ship with, and any shipped data file edited since, is carried across.
 * Program code always comes from the new build.
 */

const CODE_FILE = /\.(exe|dll|so|dylib|jar|bin|pak|pk3|pk4|vpk)$/i;
/** Extraction finishes shortly before the install is recorded; allow for slow disks. */
const INSTALL_GRACE_MS = 2 * 60 * 1000;

function normalizedVersion(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

/** A label like "Latest release" names no version, so it cannot be compared. */
function isComparableVersion(value) {
  return /\d/.test(normalizedVersion(value));
}

function shouldUpdateEdition({ fromVersion, toVersion, triedVersion }) {
  const from = normalizedVersion(fromVersion);
  const to = normalizedVersion(toVersion);
  if (!isComparableVersion(from) || !isComparableVersion(to) || from === to) return false;
  // One attempt per release: a failing update must not re-download every launch.
  return normalizedVersion(triedVersion) !== to;
}

/**
 * What to do with an installed mod, given the latest version from the catalog.
 *
 * A GitHub mod records the same tag the catalog reports. Other downloads do not
 * record anything comparable, so the first check only remembers the catalog's
 * value, and an update follows when that value next changes.
 */
function modUpdateAction({ record, downloadKind, latestVersion }) {
  const latest = normalizedVersion(latestVersion);
  if (!latest || downloadKind === "external" || record?.installerManagedExternally) return "none";
  const seen = normalizedVersion(record?.latestSeen);
  if (!seen && downloadKind !== "github-zip") return "remember";
  const current = seen || normalizedVersion(record?.version);
  if (current === latest || normalizedVersion(record?.autoUpdateTriedTo) === latest) return "none";
  return "update";
}

function listFiles(root, dir = root, out = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink()) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) listFiles(root, full, out);
    else out.push(path.relative(root, full));
  }
  return out;
}

const MANIFEST_FILE = ".playbound-manifest.json";
/** Copies can round a modified time, so stamps match within this margin. */
const STAMP_MARGIN_MS = 2000;

function stampsFor(root, files = listFiles(root)) {
  const stamps = {};
  for (const rel of files) {
    if (rel === MANIFEST_FILE) continue;
    const stat = fs.statSync(path.join(root, rel));
    stamps[rel] = { size: stat.size, mtimeMs: stat.mtimeMs };
  }
  return stamps;
}

function stampMatches(stamp, stat) {
  return stamp.size === stat.size && Math.abs(stamp.mtimeMs - stat.mtimeMs) <= STAMP_MARGIN_MS;
}

/** Records what a build shipped with, so a later update can tell it from the player's files. */
function writeManifest(dir) {
  fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(stampsFor(dir)));
}

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Copies the player's files from the old install into the new one, returning
 * the count. With a manifest this is exact: a shipped file left untouched is
 * dropped, which also removes what a release deleted. Installs from before
 * manifests fall back to comparing dates once.
 */
function carryPlayerFiles(previousDir, newDir, installedAtMs) {
  const manifest = readManifest(previousDir);
  let carried = 0;
  for (const rel of listFiles(previousDir)) {
    if (rel === MANIFEST_FILE) continue;
    const source = path.join(previousDir, rel);
    const dest = path.join(newDir, rel);
    const stat = fs.statSync(source);
    let keep;
    if (manifest) {
      const stamp = manifest[rel];
      keep = !stamp || (!stampMatches(stamp, stat) && !CODE_FILE.test(rel));
    } else {
      keep = !fs.existsSync(dest) ||
        (Number.isFinite(installedAtMs) && !CODE_FILE.test(rel) && stat.mtimeMs > installedAtMs + INSTALL_GRACE_MS);
    }
    if (!keep) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
    carried++;
  }
  return carried;
}

/**
 * Lays an unpacked mod over its target folder and returns the new stamps. With
 * the previous stamps, a file the player edited is left alone and a file the
 * new release dropped is removed.
 */
function mergeModFiles(unpackedDir, targetDir, previousStamps) {
  const incoming = listFiles(unpackedDir);
  const incomingSet = new Set(incoming);
  const stamps = {};
  const edited = (rel, stat) => previousStamps?.[rel] && !stampMatches(previousStamps[rel], stat) && !CODE_FILE.test(rel);
  for (const rel of incoming) {
    const dest = path.join(targetDir, rel);
    if (fs.existsSync(dest) && edited(rel, fs.statSync(dest))) {
      stamps[rel] = previousStamps[rel];
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(unpackedDir, rel), dest);
    const stat = fs.statSync(dest);
    stamps[rel] = { size: stat.size, mtimeMs: stat.mtimeMs };
  }
  for (const rel of Object.keys(previousStamps || {})) {
    if (incomingSet.has(rel)) continue;
    const dest = path.join(targetDir, rel);
    if (fs.existsSync(dest) && stampMatches(previousStamps[rel], fs.statSync(dest))) fs.rmSync(dest, { force: true });
  }
  return stamps;
}

module.exports = { carryPlayerFiles, mergeModFiles, writeManifest, isComparableVersion, modUpdateAction, normalizedVersion, shouldUpdateEdition };
