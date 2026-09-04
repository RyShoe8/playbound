"use strict";

const fs = require("fs");

/**
 * Native uninstallers belong to whole products, not PlayBound editions.
 * An edition is removed by deleting only its managed folder; invoking a
 * registry uninstaller here can uninstall the separately-owned base game.
 */
function mayRunNativeUninstaller(editionSlug) {
  return !editionSlug;
}

/**
 * Edition-specific executable selection. TES3MP hosting is orchestrated by
 * the local server manager; both local play and remote joins use its client.
 */
function editionLaunchExecutable(info) {
  return info?.exe || "";
}

module.exports = { mayRunNativeUninstaller, editionLaunchExecutable };
