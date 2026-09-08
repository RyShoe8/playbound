/**
 * custom-sign.js
 *
 * Custom signing hook for electron-builder Windows builds.
 *
 * electron-builder automatically signs every .exe found in unpacked node_modules
 * and extraResources. For metered cloud HSM signing (SSL.com eSigner, 240/year),
 * signing already-signed vendor redistributables or internal CLI tools wastes
 * precious signature quota.
 *
 * This hook filters files before calling signtool.exe:
 *   - Skips ViGEmBus_Setup.exe (already signed by vendor Nefarius Software Solutions e.U.)
 *   - Skips 7za.exe (internal 7-Zip CLI unpack tool, never run directly by users)
 *   - Delegates all application binaries and installers to default signtool signing.
 */

"use strict";

const path = require("path");

const SKIP_SIGN_FILENAMES = new Set([
  // Pre-signed vendor driver installer
  "vigembus_setup.exe",
  // Internal extraction tool
  "7za.exe",
  /*
   * Never executed, so a signature on it buys nothing.
   *
   * services/couch/windowsVigem.js spawns PlayBound.VigemHost.ps1 through
   * PowerShell; nothing anywhere runs the .exe. It ships in resources/vigem
   * alongside the script, and signing it quietly took the per-release cost
   * from 4 to 5. There is no elevation manifest on it either, so it would not
   * raise a UAC publisher prompt even if something did start it.
   */
  "playbound.vigemhost.exe",
]);

module.exports = async function customSign(configuration, packager) {
  const filePath = configuration.path || "";
  const fileName = path.basename(filePath).toLowerCase();

  if (SKIP_SIGN_FILENAMES.has(fileName)) {
    console.log(`[custom-sign] Skipping ${path.basename(filePath)} (pre-signed vendor or internal tool)`);
    return true;
  }

  // Delegate to electron-builder's standard signtool runner
  const signToolManager = await packager.signtoolManager.value;
  return signToolManager.doSign(configuration, packager);
};

/*
 * Exported so verify-signatures.js can report the real cost.
 *
 * That reporter counted every binary it verified, so the two skips above were
 * billed as if they had been signed: a build spending 4 signatures reported
 * ~7. Sharing one list keeps the estimate honest when the list changes.
 */
module.exports.SKIP_SIGN_FILENAMES = SKIP_SIGN_FILENAMES;
