/**
 * Per-device controller configuration storage.
 *
 * Saves, restores, and isolates game controller configurations by input device
 * (e.g., "keyboard", "phone", "xbox", "dualsense", "switchpro").
 *
 * This guarantees that:
 * 1. Choosing Mouse & Keyboard does not get overwritten by gamepad configs.
 * 2. If a player customizes their controller settings in-game for a specific
 *    device, those changes stay that way on subsequent game loads.
 * 3. Switching between devices (e.g. Phone today, Xbox controller tomorrow)
 *    preserves each device's distinct bindings without clobbering each other.
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

/** In-memory tracking of which device is currently active per running game. */
const activeDevices = new Map();

function sanitizeSlug(str) {
  return String(str || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function sanitizeDeviceId(deviceId) {
  return String(deviceId || "generic").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function getStorageDir(userDataPath, slug) {
  return path.join(userDataPath, "device-controller-configs", sanitizeSlug(slug));
}

function getSnapshotPath(userDataPath, slug, deviceId) {
  return path.join(getStorageDir(userDataPath, slug), `${sanitizeDeviceId(deviceId)}.cfg`);
}

/**
 * Check if a saved configuration snapshot exists for this game and device.
 * @param {string} userDataPath
 * @param {string} slug
 * @param {string} deviceId
 * @returns {boolean}
 */
function hasDeviceConfig(userDataPath, slug, deviceId) {
  if (!userDataPath || !slug || !deviceId) return false;
  try {
    const snap = getSnapshotPath(userDataPath, slug, deviceId);
    if (!fs.existsSync(snap)) return false;
    const stat = fs.statSync(snap);
    return stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * Save current game config from disk as a per-device snapshot.
 * @param {string} userDataPath
 * @param {string} slug
 * @param {string} deviceId
 * @param {string} configPath
 * @param {boolean} [isBinary=false]
 * @returns {Promise<boolean>}
 */
async function saveDeviceConfig(userDataPath, slug, deviceId, configPath, isBinary = false) {
  if (!userDataPath || !slug || !deviceId || !configPath) return false;
  try {
    if (!fs.existsSync(configPath)) return false;
    const content = isBinary
      ? await fsp.readFile(configPath)
      : await fsp.readFile(configPath, "utf8");

    if (!content || (typeof content === "string" && !content.trim())) return false;

    const snapPath = getSnapshotPath(userDataPath, slug, deviceId);
    await fsp.mkdir(path.dirname(snapPath), { recursive: true });

    if (isBinary) {
      await fsp.writeFile(snapPath, content);
    } else {
      await fsp.writeFile(snapPath, content, "utf8");
    }

    console.log(`[device-controller] saved ${deviceId} snapshot for ${slug}`);
    return true;
  } catch (err) {
    console.warn(`[device-controller] failed to save ${deviceId} snapshot for ${slug}:`, err?.message || err);
    return false;
  }
}

/**
 * Restore a previously saved per-device snapshot into the game's config location.
 * @param {string} userDataPath
 * @param {string} slug
 * @param {string} deviceId
 * @param {string} configPath
 * @param {boolean} [isBinary=false]
 * @returns {Promise<boolean>}
 */
async function restoreDeviceConfig(userDataPath, slug, deviceId, configPath, isBinary = false) {
  if (!userDataPath || !slug || !deviceId || !configPath) return false;
  try {
    const snapPath = getSnapshotPath(userDataPath, slug, deviceId);
    if (!fs.existsSync(snapPath)) return false;

    const content = isBinary
      ? await fsp.readFile(snapPath)
      : await fsp.readFile(snapPath, "utf8");

    if (!content) return false;

    await fsp.mkdir(path.dirname(configPath), { recursive: true });
    if (isBinary) {
      await fsp.writeFile(configPath, content);
    } else {
      await fsp.writeFile(configPath, content, "utf8");
    }

    console.log(`[device-controller] restored ${deviceId} snapshot for ${slug}`);
    return true;
  } catch (err) {
    console.warn(`[device-controller] failed to restore ${deviceId} snapshot for ${slug}:`, err?.message || err);
    return false;
  }
}

/**
 * Record which device is actively being used for this game session.
 * @param {string} slug
 * @param {string} deviceId
 * @param {string} configPath
 * @param {boolean} [isBinary=false]
 */
function recordActiveDevice(slug, deviceId, configPath, isBinary = false) {
  if (!slug || !deviceId) return;
  activeDevices.set(slug, {
    deviceId: sanitizeDeviceId(deviceId),
    configPath,
    isBinary: Boolean(isBinary),
    timestamp: Date.now(),
  });
}

/**
 * Look up the active device session info for a game.
 * @param {string} slug
 */
function getActiveDevice(slug) {
  return activeDevices.get(slug) || null;
}

/**
 * Clear the active session for a game.
 * @param {string} slug
 */
function clearActiveDevice(slug) {
  activeDevices.delete(slug);
}

/**
 * Called on game exit to snapshot any deliberate controller rebinds made in-game.
 * @param {string} userDataPath
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
async function onGameExited(userDataPath, slug) {
  const active = activeDevices.get(slug);
  if (!active || !userDataPath) return false;

  const { deviceId, configPath, isBinary } = active;
  activeDevices.delete(slug);

  if (configPath && fs.existsSync(configPath)) {
    return await saveDeviceConfig(userDataPath, slug, deviceId, configPath, isBinary);
  }
  return false;
}

module.exports = {
  getStorageDir,
  getSnapshotPath,
  hasDeviceConfig,
  saveDeviceConfig,
  restoreDeviceConfig,
  recordActiveDevice,
  getActiveDevice,
  clearActiveDevice,
  onGameExited,
};
