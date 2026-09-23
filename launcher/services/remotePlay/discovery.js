/**
 * PlayBound Remote — same-network device discovery via mDNS.
 *
 * `launcher/services/virtualLan.js` is NOT this — it drives a NetBird
 * (WireGuard) VPN mesh for online, cross-internet couch co-op. There was no
 * real LAN broadcast discovery anywhere in the codebase before this file;
 * see the plan this was built from.
 *
 * Service type `_playbound-remote._tcp` — one PlayBound install advertises
 * itself on the LAN while Remote Play is enabled, and any other PlayBound
 * install browsing for that type sees it appear/disappear in real time.
 * TXT record carries just enough for the client to show "Ryan's Gaming PC —
 * Ready" and decide whether to even attempt pairing, never an IP a human
 * has to read or type.
 */

"use strict";

const SERVICE_TYPE = "playbound-remote";
const MAX_TXT_VALUE_LENGTH = 255; // DNS-SD TXT record value limit per key

/**
 * @param {{ deviceId: string, deviceName: string, capabilities?: object }} info
 * @returns {Record<string, string>} DNS-SD TXT record — string values only,
 *   each within the 255-byte-per-value limit real resolvers enforce.
 */
function encodeTxt(info) {
  const capabilities = info.capabilities || {};
  return {
    deviceId: String(info.deviceId || "").slice(0, MAX_TXT_VALUE_LENGTH),
    deviceName: String(info.deviceName || "").slice(0, MAX_TXT_VALUE_LENGTH),
    remotePlayHost: capabilities.remotePlayHost ? "1" : "0",
    hardwareEncode: capabilities.hardwareEncode ? "1" : "0",
  };
}

/**
 * @param {Record<string, string|Buffer>} txt raw TXT record as bonjour-service delivers it
 * @returns {{ deviceId: string, deviceName: string, remotePlayHost: boolean, hardwareEncode: boolean } | null}
 *   null when the record is missing the one field a listing cannot do
 *   without — a service on the LAN that isn't a PlayBound one at all (or a
 *   malformed/foreign advertisement) must never surface as a device.
 */
function decodeTxt(txt) {
  if (!txt || typeof txt !== "object") return null;
  const field = (key) => {
    const v = txt[key];
    return Buffer.isBuffer(v) ? v.toString("utf8") : typeof v === "string" ? v : "";
  };
  const deviceId = field("deviceId");
  if (!deviceId) return null;
  return {
    deviceId,
    deviceName: field("deviceName") || "PlayBound PC",
    remotePlayHost: field("remotePlayHost") === "1",
    hardwareEncode: field("hardwareEncode") === "1",
  };
}

/**
 * @param {object} deps
 * @param {() => import("bonjour-service").Bonjour} [deps.createBonjour] injected for testability
 */
function createDiscoveryService(deps = {}) {
  const createBonjour =
    deps.createBonjour ||
    (() => {
      const { Bonjour } = require("bonjour-service");
      return new Bonjour();
    });

  let bonjour = null;
  let publishedService = null;
  let browser = null;
  /** @type {Map<string, object>} deviceId -> last-seen device info */
  const seen = new Map();

  function ensureBonjour() {
    if (!bonjour) bonjour = createBonjour();
    return bonjour;
  }

  /**
   * Start advertising this PC as a Remote Play host. No-op if already
   * advertising — callers (Settings' enable toggle) can call this
   * idempotently without tracking their own state.
   */
  function startAdvertising({ deviceId, deviceName, port, capabilities }) {
    if (publishedService) return;
    publishedService = ensureBonjour().publish({
      name: deviceName || deviceId,
      type: SERVICE_TYPE,
      port,
      txt: encodeTxt({ deviceId, deviceName, capabilities }),
    });
  }

  function stopAdvertising() {
    if (!publishedService) return;
    try {
      publishedService.stop();
    } catch {
      /* ignore — advertising is best-effort */
    }
    publishedService = null;
  }

  /**
   * Start browsing for other PlayBound Remote hosts on the LAN.
   * @param {(device: object) => void} onFound
   * @param {(deviceId: string) => void} onLost
   */
  function startBrowsing(onFound, onLost) {
    if (browser) return;
    browser = ensureBonjour().find({ type: SERVICE_TYPE });
    browser.on("up", (service) => {
      const device = decodeTxt(service.txt);
      if (!device) return;
      const addresses = Array.isArray(service.addresses) ? service.addresses : [];
      const withAddress = { ...device, host: service.host, port: service.port, addresses };
      seen.set(device.deviceId, withAddress);
      onFound(withAddress);
    });
    browser.on("down", (service) => {
      const device = decodeTxt(service.txt);
      const deviceId = device?.deviceId;
      if (!deviceId) return;
      seen.delete(deviceId);
      onLost(deviceId);
    });
  }

  function stopBrowsing() {
    if (!browser) return;
    try {
      browser.stop();
    } catch {
      /* ignore */
    }
    browser = null;
    seen.clear();
  }

  function listSeenDevices() {
    return [...seen.values()];
  }

  function dispose() {
    stopAdvertising();
    stopBrowsing();
    try {
      bonjour?.destroy();
    } catch {
      /* ignore */
    }
    bonjour = null;
  }

  return {
    startAdvertising,
    stopAdvertising,
    startBrowsing,
    stopBrowsing,
    listSeenDevices,
    dispose,
  };
}

module.exports = {
  SERVICE_TYPE,
  encodeTxt,
  decodeTxt,
  createDiscoveryService,
};
