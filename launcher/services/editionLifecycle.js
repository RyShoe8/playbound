"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Native uninstallers belong to whole products, not PlayBound editions.
 * An edition is removed by deleting only its managed folder; invoking a
 * registry uninstaller here can uninstall the separately-owned base game.
 */
function mayRunNativeUninstaller(editionSlug) {
  return !editionSlug;
}

/**
 * TES3MP's client defaults to localhost when launched without a server. That
 * looks like a permanently black game window. Normal Play opens its bundled
 * server browser; Join Game still launches the client with --connect.
 */
function editionLaunchExecutable(info, { gameSlug, editionSlug, joining } = {}, exists = fs.existsSync) {
  const current = info?.exe || "";
  if (gameSlug !== "morrowind" || editionSlug !== "tes3mp" || joining || !info?.dir) {
    return current;
  }
  const browser = path.join(info.dir, "tes3mp-browser.exe");
  return exists(browser) ? browser : current;
}

module.exports = { mayRunNativeUninstaller, editionLaunchExecutable };
