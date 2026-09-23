/**
 * PlayBound Input Engine — translates one physical controller frame into
 * keyboard/mouse output commands for a `verified` ControlProfile.
 *
 * Consumes the exact same 120Hz frame shape `gamepadBridge.js` already
 * receives (`{ buttons, lx, ly, rx, ry, lt, rt }`) — nothing about intake
 * changes. The output is a list of commands meant for the extended ViGEm
 * sidecar (`windowsVigem.js`'s `sendKey`/`sendMouseMove`/`sendMouseButton`),
 * which performs the actual `SendInput` synthesis outside the renderer.
 *
 * One instance per active game session: create fresh on activate (see
 * `applyControllerConfig` in main.js), call `tick()` per incoming frame, and
 * call `releaseAll()` on deactivate/exit so no synthetic key or mouse button
 * is left held down if the game crashes instead of exiting cleanly.
 */

"use strict";

const { stickToMouseDelta, DEFAULT_SETTINGS } = require("./responseCurve");
const { diffActionEvents } = require("./actionMap");
const { VK } = require("./vkCodes");

function commandsForOutput(output, down) {
  if (!output) return [];
  if (output.type === "key") {
    const vk = VK[output.vk];
    if (vk == null) return [];
    return [{ cmd: "key", vk, action: down ? "down" : "up" }];
  }
  if (output.type === "mouseButton") {
    return [{ cmd: "mouseButton", button: output.button, action: down ? "down" : "up" }];
  }
  return [];
}

/**
 * @param {object} profile a `ControlProfile` document (actions/bindings/
 *   contexts/stickMouseSettings) — see platform/src/lib/models/ControlProfile.ts
 */
function createInputEngine(profile) {
  let prevFrame = null;
  const smoothState = { vx: 0, vy: 0 };
  const actionsById = new Map((profile.actions || []).map((a) => [a.id, a]));

  /**
   * @param {object} frame physical frame `{ buttons, lx, ly, rx, ry, lt, rt }`
   * @param {number} dtSeconds time since the previous `tick()` call
   * @param {boolean} [precisionActive]
   * @returns {Array<object>} sidecar commands to send this frame
   */
  function tick(frame, dtSeconds, precisionActive = false) {
    const commands = [];
    const { down, up } = diffActionEvents(prevFrame, frame, profile);
    for (const id of down) commands.push(...commandsForOutput(actionsById.get(id)?.output, true));
    for (const id of up) commands.push(...commandsForOutput(actionsById.get(id)?.output, false));

    const mouseSettings = profile.stickMouseSettings || DEFAULT_SETTINGS;
    if (mouseSettings.enabled !== false) {
      const { dx, dy } = stickToMouseDelta(
        { x: frame?.rx || 0, y: frame?.ry || 0 },
        mouseSettings,
        dtSeconds,
        smoothState,
        precisionActive
      );
      if (dx !== 0 || dy !== 0) commands.push({ cmd: "mouseMove", dx, dy });
    }

    prevFrame = frame;
    return commands;
  }

  /**
   * Current effective stick-mouse settings (profile defaults merged with any
   * live override from `updateSettings`).
   */
  function getSettings() {
    return { ...DEFAULT_SETTINGS, ...(profile.stickMouseSettings || {}) };
  }

  /**
   * Merge a partial settings override (sensitivity, invertY, ...) into the
   * profile the engine reads from on its next `tick()` — this is the
   * overlay's Controls tab live-tuning path. Mutates `profile` in place
   * rather than swapping in a new object, since `tick()` reads
   * `profile.stickMouseSettings` fresh every call; no engine recreation, no
   * dropped frames.
   *
   * A session-only override: it lives only as long as this activation
   * (cleared on `releaseAll`/deactivate along with everything else), not
   * persisted back to the profile document.
   */
  function updateSettings(partial) {
    profile.stickMouseSettings = { ...getSettings(), ...(partial || {}) };
  }

  /**
   * Release every action's output, regardless of last-known held state.
   * Releasing an already-up key/button is a harmless no-op on the sidecar
   * side — the point is to guarantee nothing stays synthetically held down.
   */
  function releaseAll() {
    const commands = [];
    for (const action of actionsById.values()) {
      commands.push(...commandsForOutput(action.output, false));
    }
    prevFrame = null;
    smoothState.vx = 0;
    smoothState.vy = 0;
    return commands;
  }

  return { tick, releaseAll, getSettings, updateSettings };
}

module.exports = { createInputEngine };
