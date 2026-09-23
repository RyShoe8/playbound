/**
 * PlayBound Remote — device pairing (request → host approves → trusted).
 *
 * Mirrors couch mode's approve pattern (`couch/inputAuth.js`) one level up:
 * couch approves one *controller* for the duration of a session; this
 * approves one *device* permanently, persisted through the platform's
 * `/api/devices/[deviceId]/trust` so it survives a reinstall and is
 * revocable from Settings on either PC.
 *
 * A pairing request itself is deliberately never written to Mongo — it's a
 * synchronous, live interaction over the direct LAN connection a client
 * opens to the host (see `hostApi.js`), so it needs nothing more durable
 * than this in-memory map. Only the *outcome* (a device becoming trusted)
 * is worth persisting.
 */

"use strict";

const crypto = require("crypto");

const DEFAULT_TTL_MS = 2 * 60 * 1000; // a request nobody answers must not linger forever

/**
 * @param {{ deviceId: string, name: string }} client
 * @returns {{ requestId: string, deviceId: string, name: string, status: "pending", createdAt: number }}
 */
function createPendingRequest(client) {
  return {
    requestId: crypto.randomUUID(),
    deviceId: client.deviceId,
    name: client.name,
    status: "pending",
    createdAt: Date.now(),
  };
}

function isExpired(request, now = Date.now(), ttlMs = DEFAULT_TTL_MS) {
  return now - request.createdAt > ttlMs;
}

/**
 * @param {object} deps
 * @param {string} deps.hostDeviceId
 * @param {() => string} deps.getApiBase
 * @param {(url: string, init?: object) => Promise<Response>} deps.authedFetch
 * @param {(request: object) => void} deps.onPairingRequest called when a new
 *   device asks to pair — the caller wires this to the host-side "Allow this
 *   device?" prompt.
 * @param {number} [deps.ttlMs]
 */
function createPairingService({ hostDeviceId, getApiBase, authedFetch, onPairingRequest, ttlMs = DEFAULT_TTL_MS }) {
  /** @type {Map<string, object>} requestId -> pending request */
  const pending = new Map();
  /** @type {Map<string, (allowed: boolean) => void>} requestId -> the waiting connection's resolver */
  const waiters = new Map();
  /** @type {Set<string>} known-trusted deviceIds, refreshed from the platform */
  let trustedCache = new Set();

  function pruneExpired() {
    const now = Date.now();
    for (const [id, req] of pending) {
      if (isExpired(req, now, ttlMs)) {
        pending.delete(id);
        waiters.delete(id);
      }
    }
  }

  async function refreshTrusted() {
    const res = await authedFetch(`${getApiBase()}/api/devices/${encodeURIComponent(hostDeviceId)}/trust`);
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const list = Array.isArray(data?.trustedDevices) ? data.trustedDevices : [];
    trustedCache = new Set(list.map((d) => d.deviceId));
  }

  function isTrusted(deviceId) {
    return trustedCache.has(deviceId);
  }

  /**
   * A client on the LAN asks to pair. Returns a promise that resolves once
   * a human approves or denies (or the request times out and is treated as
   * denied) — the caller (hostApi.js's connection handler) awaits this and
   * sends the result back over the same connection.
   * @returns {Promise<boolean>}
   */
  function requestPairing(client) {
    pruneExpired();
    if (isTrusted(client.deviceId)) return Promise.resolve(true);

    const request = createPendingRequest(client);
    pending.set(request.requestId, request);
    onPairingRequest(request);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(request.requestId);
        pending.delete(request.requestId);
        resolve(false);
      }, ttlMs);
      waiters.set(request.requestId, (allowed) => {
        clearTimeout(timer);
        resolve(allowed);
      });
    });
  }

  /**
   * The host UI calls this once a human clicks Allow/Deny.
   * @returns {Promise<boolean>} true if the request existed and was resolved
   */
  async function respondToPairing(requestId, allow) {
    const request = pending.get(requestId);
    if (!request) return false;
    pending.delete(requestId);

    if (allow) {
      const res = await authedFetch(`${getApiBase()}/api/devices/${encodeURIComponent(hostDeviceId)}/trust`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: request.deviceId, name: request.name }),
      });
      if (res.ok) trustedCache.add(request.deviceId);
      else allow = false; // persistence failed — don't tell the client it's trusted when it isn't
    }

    const resolve = waiters.get(requestId);
    waiters.delete(requestId);
    resolve?.(allow);
    return true;
  }

  function listPending() {
    pruneExpired();
    return [...pending.values()];
  }

  return {
    requestPairing,
    respondToPairing,
    listPending,
    isTrusted,
    refreshTrusted,
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  createPendingRequest,
  isExpired,
  createPairingService,
};
