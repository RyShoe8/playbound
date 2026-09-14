/**
 * PlayBound Universal Gamepad Bridge (Main Process Service)
 * 
 * Bridges physical DualSense (PS5), DualShock (PS4), Nintendo Switch Pro,
 * and DirectInput controllers into a standardized virtual XInput (Xbox 360)
 * controller via ViGEmBus.
 */

"use strict";

const { createProvider } = require("./couch/VirtualControllerProvider");
const { BUTTON } = require("./couch/protocol");

let provider = null;
let activeHandle = null;
let isBridging = false;
let currentProfile = null;

function getProvider() {
  if (!provider) {
    provider = createProvider();
  }
  return provider;
}

/**
 * Start the virtual Xbox 360 controller device.
 * @param {object} [profile] Info about the physical pad being bridged.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
/**
 * Optional couch guard — set from main so the bridge cannot mint a slot-0
 * ViGEm while Connect remotes own slots (that mirrored the host into P1+P2).
 * @type {null | (() => boolean)}
 */
let isCouchActive = null;

function setCouchActiveChecker(fn) {
  isCouchActive = typeof fn === "function" ? fn : null;
}

async function startBridge(profile = {}) {
  if (isCouchActive?.()) {
    console.warn("[gamepad-bridge] refused — couch session is active");
    return { ok: false, error: "Couch session is active" };
  }
  if (isBridging && activeHandle) {
    return { ok: true };
  }

  try {
    const prov = getProvider();
    const probe = await prov.probe();
    if (!probe.ok) {
      return { ok: false, error: probe.reason || "ViGEmBus driver not ready" };
    }

    activeHandle = await prov.createController(0);
    isBridging = true;
    currentProfile = profile;
    console.log("[gamepad-bridge] Started virtual XInput controller for", profile.label || "Gamepad");
    return { ok: true };
  } catch (err) {
    console.error("[gamepad-bridge] Failed to start:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Stop the virtual Xbox 360 controller device.
 */
function stopBridge() {
  if (activeHandle) {
    try {
      activeHandle.remove();
    } catch {
      /* ignore */
    }
    activeHandle = null;
  }
  isBridging = false;
  currentProfile = null;
  console.log("[gamepad-bridge] Stopped virtual XInput controller");
  return { ok: true };
}

/**
 * Apply input state frame from the physical controller.
 * @param {object} state { buttons, lx, ly, rx, ry, lt, rt }
 */
function applyInputFrame(state) {
  if (!isBridging || !activeHandle || !state) return;
  try {
    activeHandle.applyState({
      p: 0,
      buttons: Number(state.buttons) || 0,
      lx: Number(state.lx) || 0,
      ly: Number(state.ly) || 0,
      rx: Number(state.rx) || 0,
      ry: Number(state.ry) || 0,
      lt: Number(state.lt) || 0,
      rt: Number(state.rt) || 0,
    });
  } catch (err) {
    /* avoid throwing on transient frame */
  }
}

function getBridgeState() {
  return {
    isBridging,
    profile: currentProfile,
  };
}

module.exports = {
  startBridge,
  stopBridge,
  applyInputFrame,
  getBridgeState,
  setCouchActiveChecker,
  BUTTON,
};
