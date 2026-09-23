/**
 * Ensures the pinned Sunshine Windows release exists under resources/sunshine/.
 * Sunshine provides host capture/encode for PlayBound Remote.
 *
 * Pin: Sunshine v2026.914.233613 (GPL-3.0).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const TAG = "[vendor-sunshine]";
const SUNSHINE_VERSION = "2026.914.233613";
const ZIP_URL = `https://github.com/LizardByte/Sunshine/releases/download/v${SUNSHINE_VERSION}/Sunshine-Windows-AMD64-lite.zip`;
const LICENSE_URL = "https://raw.githubusercontent.com/LizardByte/Sunshine/master/LICENSE";

const outDir = path.join(__dirname, "..", "resources", "sunshine");
const exePath = path.join(outDir, "sunshine.exe");
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
  const needSunshine =
    !fs.existsSync(exePath) ||
    fs.statSync(exePath).size < 1_000_000 ||
    pinned !== SUNSHINE_VERSION;
  const needLicense = !fs.existsSync(licensePath);

  if (!needSunshine && !needLicense) {
    console.log(`${TAG} Sunshine ${SUNSHINE_VERSION} already vendored.`);
    return;
  }

  if (needSunshine) {
    console.log(`${TAG} Downloading Sunshine ${SUNSHINE_VERSION}…`);
    const zipPath = path.join(outDir, "sunshine.zip");
    await download(ZIP_URL, zipPath);
    console.log(`${TAG} Extracting ${zipPath}…`);

    // Extract using Windows built-in tar or PowerShell
    try {
      execFileSync("tar.exe", ["-xf", zipPath, "-C", outDir], { stdio: "inherit" });
    } catch {
      execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force`],
        { stdio: "inherit" }
      );
    }

    try {
      fs.unlinkSync(zipPath);
    } catch {
      /* ignore */
    }

    fs.writeFileSync(versionPath, `${SUNSHINE_VERSION}\n`);
    console.log(`${TAG} Vendored Sunshine to ${outDir}`);
  }

  if (needLicense) {
    console.log(`${TAG} Downloading LICENSE…`);
    try {
      await download(LICENSE_URL, licensePath);
    } catch (err) {
      console.warn(`${TAG} License download warning:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error(`${TAG} ERROR: ${err.message || err}`);
  process.exit(1);
});
