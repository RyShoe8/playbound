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
