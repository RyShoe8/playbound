"use strict";

/**
 * Where flight-device profiles come from at runtime, besides the ones shipped
 * in flightDevices.js:
 *
 *   - the site's shared list, fetched at startup and cached for offline use,
 *     so a device measured by one player works for everyone without a
 *     launcher release;
 *   - this PC's own calibrations, which win over everything for this PC.
 *
 * A calibration is also offered to the site, where it waits for review before
 * it is shared. Nothing here blocks a launch: every failure falls back to what
 * is already known.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const flightDevices = require("./flightDevices");

const CALIBRATIONS_FILE = "flight-device-profiles.json";
const REMOTE_CACHE_FILE = "flight-device-profiles-remote.json";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Load this PC's calibrations and the last shared list seen. Synchronous; safe at startup. */
function loadLocalProfiles(userDataPath) {
  const calibrations = readJson(path.join(userDataPath, CALIBRATIONS_FILE));
  const cached = readJson(path.join(userDataPath, REMOTE_CACHE_FILE));
  return {
    remote: flightDevices.registerProfiles(cached?.profiles, "remote"),
    calibration: flightDevices.registerProfiles(calibrations?.profiles, "calibration"),
  };
}

/** Fetch the shared list. Keeps the cached one when the site cannot be reached. */
async function refreshRemoteProfiles({ userDataPath, apiBase, fetchImpl = fetch, headers = {} }) {
  try {
    const res = await fetchImpl(`${apiBase}/api/launcher/device-profiles`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { refreshed: false, status: res.status };
    const body = await res.json();
    const profiles = Array.isArray(body?.profiles) ? body.profiles : [];
    flightDevices.clearRegisteredProfiles("remote");
    const kept = flightDevices.registerProfiles(profiles, "remote");
    // Calibrations were registered before; re-register so they keep priority.
    const calibrations = readJson(path.join(userDataPath, CALIBRATIONS_FILE));
    flightDevices.registerProfiles(calibrations?.profiles, "calibration");
    await fsp.writeFile(path.join(userDataPath, REMOTE_CACHE_FILE), JSON.stringify({ fetchedAt: new Date().toISOString(), profiles }), "utf8");
    return { refreshed: true, kept };
  } catch (err) {
    return { refreshed: false, error: err?.message || String(err) };
  }
}

/**
 * Keep a calibration for this PC and offer it to the site. Returns the cleaned
 * profile, or null when it does not describe a usable device.
 */
async function saveCalibration({ userDataPath, raw, apiBase, fetchImpl = fetch, headers = {} }) {
  const profile = flightDevices.normalizeProfile(raw);
  if (!profile) return { ok: false, error: "That calibration is missing the stick axes." };
  const file = path.join(userDataPath, CALIBRATIONS_FILE);
  const existing = readJson(file)?.profiles || [];
  const profiles = [...existing.filter((p) => p?.vidPid !== profile.vidPid), profile];
  await fsp.writeFile(file, JSON.stringify({ profiles }, null, 2), "utf8");
  flightDevices.registerProfiles([profile], "calibration");
  let shared = false;
  try {
    const res = await fetchImpl(`${apiBase}/api/launcher/device-profiles`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ profile }),
      signal: AbortSignal.timeout(10_000),
    });
    shared = res.ok;
  } catch {
    // Kept locally either way; sharing is a bonus.
  }
  return { ok: true, profile, shared };
}

module.exports = { loadLocalProfiles, refreshRemoteProfiles, saveCalibration, CALIBRATIONS_FILE, REMOTE_CACHE_FILE };
