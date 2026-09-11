/**
 * The Dark Mod ships a zipsync updater (tdm_installer), not Inno/NSIS.
 * Upstream supports --unattended: install latest stable into the installer's
 * directory with no confirmation clicks.
 */

"use strict";

const path = require("path");

function isDarkModSlug(slug) {
  return String(slug || "").toLowerCase() === "the-dark-mod";
}

function isTdmInstallerBasename(name) {
  return /^tdm_installer(\.exe|\.linux64)?$/i.test(String(name || ""));
}

/** Args for a fully automatic TDM content install. */
function tdmUnattendedArgs() {
  return ["--unattended"];
}

/**
 * Poll budget while waiting for TheDarkModx64.exe after the updater starts.
 * A full TDM download is multi-GB; the default 10-minute installer poll is too short.
 */
function tdmInstallerPollMaxMs() {
  return 90 * 60 * 1000;
}

module.exports = {
  isDarkModSlug,
  isTdmInstallerBasename,
  tdmUnattendedArgs,
  tdmInstallerPollMaxMs,
};
