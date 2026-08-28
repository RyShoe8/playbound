/**
 * Ensures the pinned NetBird Windows MSI exists under resources/netbird/.
 * Used by build-windows.js so CI / clean trees still package the installer.
 *
 * Pin: NetBird v0.77.1 (BSD-3-Clause).
 *
 * Modelled on vendor-vigem.js — same download-and-pin pattern, same
 * idempotence: if the pinned version already exists on disk, this is a no-op.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const TAG = "[vendor-netbird]";
const NETBIRD_VERSION = "0.77.1";
const MSI_URL =
  `https://github.com/netbirdio/netbird/releases/download/v${NETBIRD_VERSION}/netbird_installer_${NETBIRD_VERSION}_windows_amd64.msi`;
const LICENSE_URL =
  `https://raw.githubusercontent.com/netbirdio/netbird/v${NETBIRD_VERSION}/LICENSE`;

const outDir = path.join(__dirname, "..", "resources", "netbird");
// The NSIS script and runtime code both reference this fixed name so a version
// bump only needs to touch this file, not the installer hooks.
const msiPath = path.join(outDir, "netbird_installer.msi");
const licensePath = path.join(outDir, "LICENSE");
const versionPath = path.join(outDir, "VERSION");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u, redirects = 0) => {
      https
        .get(u, (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirects < 5
          ) {
            res.resume();
            get(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`GET ${u} → ${res.statusCode}`));
            res.resume();
            return;
          }
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
        })
        .on("error", (err) => {
          try {
            fs.unlinkSync(dest);
          } catch {
            /* ignore */
          }
          reject(err);
        });
    };
    get(url);
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const pinned = fs.existsSync(versionPath)
    ? fs.readFileSync(versionPath, "utf8").trim()
    : "";
  const needMsi =
    !fs.existsSync(msiPath) ||
    fs.statSync(msiPath).size < 1_000_000 ||
    pinned !== NETBIRD_VERSION;
  const needLicense = !fs.existsSync(licensePath);

  if (!needMsi && !needLicense) {
    console.log(`${TAG} NetBird ${NETBIRD_VERSION} already vendored.`);
    return;
  }

  if (needMsi) {
    console.log(`${TAG} Downloading NetBird ${NETBIRD_VERSION} MSI…`);
    const tmp = `${msiPath}.tmp`;
    await download(MSI_URL, tmp);
    fs.renameSync(tmp, msiPath);
    fs.writeFileSync(versionPath, `${NETBIRD_VERSION}\n`);
    console.log(`${TAG} Wrote ${msiPath} (${fs.statSync(msiPath).size} bytes)`);
  }
  if (needLicense) {
    console.log(`${TAG} Downloading LICENSE…`);
    await download(LICENSE_URL, licensePath);
  }
}

main().catch((err) => {
  console.error(`${TAG} ERROR: ${err.message || err}`);
  process.exit(1);
});
