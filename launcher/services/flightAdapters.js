"use strict";

/**
 * Game adapters for flight devices. See flightDevices.js for the device side.
 *
 * An adapter knows one game's control files. `autoApply` runs before every
 * launch and binds a device with a measured profile, silently, leaving any
 * setup the player has made themselves alone. `configure` runs when the player
 * explicitly chooses flight-stick play and binds whatever device is in the
 * first slot, falling back to the generic flight-stick layout.
 *
 * Adding a game: write its two functions here (and the format code beside it,
 * as fsoHotas.js does for FreeSpace Open). Every device with a profile then
 * works in it.
 */

const path = require("path");

const ADAPTERS = {
  "star-wars-fate-of-the-galaxy": {
    engine: "FreeSpace Open",
    autoApply(installDir, ctx) {
      const fso = require("./fsoHotas");
      return fso.autoApplyFotgDevicePresets(installDir, fso.fsoSettingsPath(installDir, ctx.appData));
    },
    configure(installDir, ctx, devices) {
      const fso = require("./fsoHotas");
      return fso.configureFotgHotas4(installDir, fso.fsoSettingsPath(installDir, ctx.appData), devices);
    },
  },
};

function flightAdapterFor(slug) {
  return ADAPTERS[slug] || null;
}

/**
 * Before launch: bind a measured device if this game has an adapter. Never
 * throws — a game must still start if its control files cannot be written.
 */
async function autoApplyFlightDevices(slug, installDir, ctx, log = console) {
  const adapter = flightAdapterFor(slug);
  if (!adapter || !installDir) return { applied: false };
  try {
    const outcome = await adapter.autoApply(path.resolve(installDir), ctx);
    if (outcome?.applied && outcome.activated) {
      log.log?.(`[flight] ${outcome.device || "flight device"} bindings applied to ${outcome.activated} pilot(s) for ${slug}`);
    }
    return outcome || { applied: false };
  } catch (err) {
    log.warn?.(`[flight] automatic setup skipped for ${slug}:`, err?.message || err);
    return { applied: false, error: err?.message || String(err) };
  }
}

module.exports = { ADAPTERS, flightAdapterFor, autoApplyFlightDevices };
