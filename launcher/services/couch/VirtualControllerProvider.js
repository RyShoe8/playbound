/**
 * VirtualControllerProvider — stable game-facing abstraction.
 * Windows uses ViGEm via a bundled host (PowerShell + client DLL);
 * other platforms return unsupported.
 */

"use strict";

const { emptyPadState } = require("./protocol");

function createNullProvider(reason) {
  const pads = new Map();
  return {
    id: "null",
    async probe() {
      return { ok: false, reason: reason || "Virtual controllers unavailable on this platform." };
    },
    async createController(slot) {
      const handle = {
        slot,
        remove() {
          pads.delete(slot);
        },
        applyState(_state) {
          pads.set(slot, _state || emptyPadState(slot));
        },
      };
      pads.set(slot, emptyPadState(slot));
      return handle;
    },
    dispose() {
      pads.clear();
    },
  };
}

function createProvider() {
  if (process.platform === "win32") {
    try {
      return require("./windowsVigem").createWindowsVigemProvider();
    } catch (err) {
      return createNullProvider(
        err && err.message
          ? err.message
          : "Windows virtual controller module failed to load."
      );
    }
  }
  return createNullProvider("Virtual controllers are Windows-only in Milestone 1.");
}

module.exports = {
  createProvider,
  createNullProvider,
};
