/**
 * Ensures the pinned ViGEmBus redistributable exists under resources/vigem/.
 * Used by build-windows.js so CI / clean trees still package the driver.
 *
 * Pin: Nefarius ViGEmBus v1.22.0 (MIT).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const TAG = "[vendor-vigem]";
const VIGEM_VERSION = "1.22.0";
const SETUP_URL =
  "https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe";
const LICENSE_URL =
  "https://raw.githubusercontent.com/nefarius/ViGEmBus/v1.22.0/LICENSE";

const outDir = path.join(__dirname, "..", "resources", "vigem");
const setupPath = path.join(outDir, "ViGEmBus_Setup.exe");
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
  const needSetup =
    !fs.existsSync(setupPath) ||
    fs.statSync(setupPath).size < 1_000_000 ||
    pinned !== VIGEM_VERSION;
  const needLicense = !fs.existsSync(licensePath);

  if (!needSetup && !needLicense) {
    console.log(`${TAG} ViGEmBus ${VIGEM_VERSION} already vendored.`);
    return;
  }

  if (needSetup) {
    console.log(`${TAG} Downloading ViGEmBus ${VIGEM_VERSION} setup…`);
    const tmp = `${setupPath}.tmp`;
    await download(SETUP_URL, tmp);
    fs.renameSync(tmp, setupPath);
    fs.writeFileSync(versionPath, `${VIGEM_VERSION}\n`);
    console.log(`${TAG} Wrote ${setupPath} (${fs.statSync(setupPath).size} bytes)`);
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
