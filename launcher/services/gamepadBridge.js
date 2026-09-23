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
const { createInputEngine } = require("./inputEngine/index");
const { hasControlsHost } = require("./couch/windowsVigem");

let provider = null;
let activeHandle = null;
let isBridging = false;
let currentProfile = null;

function getProvider() {
  if (!provider) {
    provider = createProvider();
    provider.setExitHandler?.(() => {
      if (!activeEngine) return;
      // A crashed sidecar cannot release keys it pressed. Start a fresh host
      // to send key-up events, then treat the next frame as a new press.
      sendCommandsToSidecar(activeEngine.releaseAll());
      lastTickAt = null;
    });
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
 * PlayBound Controls — keyboard/mouse synthesis for a `verified`
 * ControlProfile, driven from the same physical frame this module already
 * receives for ViGEm bridging. See launcher/services/inputEngine/ for the
 * translation itself; this is just the runtime that owns one active engine,
 * ticks it per frame, and forwards its commands to the sidecar.
 *
 * Independent of `isBridging`/`activeHandle` above — activating PlayBound
 * Controls never creates a virtual XInput pad, so it cannot conflict with
 * couch's slot-0 reservation the way the ViGEm bridge can.
 */
let activeEngine = null;
let activeProfileMeta = null; // { name, gameSlug } — for the overlay's Controls tab, not the engine itself
let lastTickAt = null;

function activatePlayBoundControls(profile) {
  if (!hasControlsHost()) return false;
  deactivatePlayBoundControls();
  activeEngine = createInputEngine(profile);
  activeProfileMeta = {
    name: profile.name || "PlayBound Controls",
    gameSlug: profile.gameSlug || null,
    editionSlug: profile.editionSlug || null,
    bindings: (profile.bindings || []).map((binding) => ({
      input: binding.physicalInput,
      action: (profile.actions || []).find((action) => action.id === binding.actionId)?.label || binding.actionId,
    })),
  };
  lastTickAt = null;
  return true;
}

/** Release every synthetic key/button the active profile could hold, then clear the engine. */
function deactivatePlayBoundControls() {
  if (!activeEngine) return;
  sendCommandsToSidecar(activeEngine.releaseAll());
  activeEngine = null;
  activeProfileMeta = null;
  lastTickAt = null;
}

function isPlayBoundControlsActive() {
  return Boolean(activeEngine);
}

/** What the overlay's Controls tab renders — null when nothing is active. */
function getActiveControlsInfo() {
  if (!activeEngine || !activeProfileMeta) return null;
  return { ...activeProfileMeta, settings: activeEngine.getSettings() };
}

/**
 * Live-tune the active profile's stick-mouse response curve from the
 * overlay — takes effect on the very next physical frame, no restart.
 * A no-op (not an error) when nothing is active: the overlay may call this
 * from a stale panel a moment after the game already exited.
 */
function updateControlsSettings(partial) {
  if (!activeEngine) return null;
  const safe = {};
  if (Number.isFinite(partial?.sensitivity)) {
    safe.sensitivity = Math.max(0.1, Math.min(5, partial.sensitivity));
  }
  if (typeof partial?.invertY === "boolean") safe.invertY = partial.invertY;
  activeEngine.updateSettings(safe);
  return activeEngine.getSettings();
}

function sendCommandsToSidecar(commands) {
  if (!commands || !commands.length) return;
  const prov = getProvider();
  for (const cmd of commands) {
    try {
      if (cmd.cmd === "key") prov.sendKey(cmd.vk, cmd.action);
      else if (cmd.cmd === "mouseMove") prov.sendMouseMove(cmd.dx, cmd.dy);
      else if (cmd.cmd === "mouseButton") prov.sendMouseButton(cmd.button, cmd.action);
    } catch (err) {
      /* one bad command must not stop the rest, or a dropped release could stick a key down */
    }
  }
}

/**
 * Apply input state frame from the physical controller.
 * @param {object} state { buttons, lx, ly, rx, ry, lt, rt }
 */
function applyInputFrame(state) {
  if (activeEngine && state) {
    const now = Date.now();
    // First tick after activation has no prior timestamp; assume one frame
    // at the renderer's ~120Hz poll rate rather than a huge/zero delta.
    const dtSeconds = lastTickAt ? Math.min(0.05, (now - lastTickAt) / 1000) : 1 / 120;
    lastTickAt = now;
    try {
      sendCommandsToSidecar(activeEngine.tick(state, dtSeconds));
    } catch (err) {
      /* a bad frame must not crash the poll loop */
    }
  }

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
    playBoundControlsActive: isPlayBoundControlsActive(),
  };
}

module.exports = {
  startBridge,
  stopBridge,
  applyInputFrame,
  getBridgeState,
  setCouchActiveChecker,
  activatePlayBoundControls,
  deactivatePlayBoundControls,
  isPlayBoundControlsActive,
  getActiveControlsInfo,
  updateControlsSettings,
  BUTTON,
};
