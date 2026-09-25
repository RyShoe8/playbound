"use strict";

/*
 * Moved out of main.js unchanged: helpers that touch no main-process state
 * (no windows, sessions or timers). main.js requires what it needs from here.
 */

const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DEFAULT_API_BASE, loadSettings, saveSettings } = require("./core");

/*
 * Mirrors electron-updater's own cache-dir formula exactly (see
 * node_modules/electron-updater/out/AppAdapter.js getAppCacheDir() and
 * AppUpdater.js getOrCreateDownloadHelper()) rather than guessing a path —
 * app.getName() and the per-OS base cache dir are the only two inputs, and
 * both are available here at runtime, so there is no reason to hardcode
 * something that could drift from the library's actual behavior.
 */
function updaterCacheDir() {
  const home = os.homedir();
  let base;
  if (process.platform === "win32") {
    base = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  } else if (process.platform === "darwin") {
    base = path.join(home, "Library", "Caches");
  } else {
    base = process.env.XDG_CACHE_HOME || path.join(home, ".cache");
  }
  return path.join(base, app.getName());
}

/*
 * A checksum/signature mismatch means the bytes electron-updater ended up
 * with do not match what the manifest says they should be — usually a
 * partial or superseded download left in its cache. electron-updater has no
 * recovery for this: it re-verifies the same bad bytes against the same
 * manifest forever, and neither relaunching the app nor rebooting clears a
 * disk-persistent cache directory. Wiping it is what a manual
 * `rm -rf ~/.cache/PlayBound` does by hand.
 */
function isCacheCorruptionError(message) {
  return /checksum|sha512|sha256|signature/i.test(String(message || ""));
}

async function clearStaleUpdaterCache(reason) {
  const dir = updaterCacheDir();
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
    console.log(`[updater] Cleared cache at ${dir} after: ${reason}`);
    return true;
  } catch (err) {
    console.warn(`[updater] Could not clear cache at ${dir}:`, err?.message || err);
    return false;
  }
}

/**
 * Give up on auto-updating after repeated verification failures.
 *
 * Clearing the cache fixes the common case, but it cannot fix every case: a
 * Linux tester running the AppImage under Gearlever's bwrap sandbox kept
 * getting one identical expected/got hash pair across three server-side
 * releases, a full uninstall/reinstall, and a cache wipe — the bytes reaching
 * the verifier were never the ones we published, for a reason outside this
 * process. Whatever the cause, retrying forever is the wrong response: it
 * burns bandwidth on every check and leaves someone staring at the same error
 * with nothing to act on.
 *
 * So the breaker counts *consecutive* failures for one offered version and,
 * past the threshold, stops auto-downloading and tells the user to grab the
 * installer by hand instead. State is persisted rather than held in memory
 * precisely because a restart is the thing that does not help here — an
 * in-memory counter would reset on every relaunch and the loop would resume.
 *
 * It is keyed by version and cleared on success, so a genuinely new release
 * always gets a clean attempt: this can delay an update, never permanently
 * block one.
 */
const UPDATE_FAILURE_LIMIT = 3;
const MANUAL_DOWNLOAD_URL = `${DEFAULT_API_BASE}/launcher`;

function readUpdateFailures() {
  try {
    const record = loadSettings().updateFailures;
    if (!record || typeof record !== "object") return null;
    if (typeof record.version !== "string" || !Number.isFinite(Number(record.count))) return null;
    return { version: record.version, count: Number(record.count) };
  } catch {
    return null;
  }
}

function writeUpdateFailures(record) {
  try {
    const settings = loadSettings();
    if (record) settings.updateFailures = record;
    else delete settings.updateFailures;
    saveSettings(settings);
  } catch (err) {
    console.warn("[updater] Could not persist update-failure state:", err?.message || err);
  }
}

/** True once this version has failed verification too many times to keep retrying. */
function updateBreakerTripped(version) {
  if (!version) return false;
  const record = readUpdateFailures();
  return Boolean(record && record.version === version && record.count >= UPDATE_FAILURE_LIMIT);
}

/** @returns the new consecutive-failure count for this version. */
function recordUpdateFailure(version) {
  if (!version) return 0;
  const previous = readUpdateFailures();
  // A different version means a different download; start its count fresh.
  const count = previous && previous.version === version ? previous.count + 1 : 1;
  writeUpdateFailures({ version, count });
  return count;
}

function clearUpdateFailures() {
  if (readUpdateFailures()) writeUpdateFailures(null);
}

function manualDownloadMessage(version) {
  return (
    `Automatic update to ${version} failed verification ${UPDATE_FAILURE_LIMIT} times, so PlayBound stopped retrying. ` +
    `Download the latest installer directly from ${MANUAL_DOWNLOAD_URL} instead.`
  );
}

module.exports = { updaterCacheDir, isCacheCorruptionError, clearStaleUpdaterCache, UPDATE_FAILURE_LIMIT, MANUAL_DOWNLOAD_URL, readUpdateFailures, writeUpdateFailures, updateBreakerTripped, recordUpdateFailure, clearUpdateFailures, manualDownloadMessage };
