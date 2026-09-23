/**
 * Ensures the pinned Moonlight Windows release exists under resources/moonlight/.
 * Moonlight provides client decode/input for PlayBound Remote.
 *
 * Pin: Moonlight v6.1.0 (GPL-3.0).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const TAG = "[vendor-moonlight]";
const MOONLIGHT_VERSION = "6.1.0";
const ZIP_URL = `https://github.com/moonlight-stream/moonlight-qt/releases/download/v${MOONLIGHT_VERSION}/MoonlightPortable-x64-${MOONLIGHT_VERSION}.zip`;
const LICENSE_URL = "https://raw.githubusercontent.com/moonlight-stream/moonlight-qt/master/LICENSE";

const outDir = path.join(__dirname, "..", "resources", "moonlight");
const exePath = path.join(outDir, "Moonlight.exe");
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
  const needMoonlight =
    !fs.existsSync(exePath) ||
    fs.statSync(exePath).size < 1_000_000 ||
    pinned !== MOONLIGHT_VERSION;
  const needLicense = !fs.existsSync(licensePath);

  if (!needMoonlight && !needLicense) {
    console.log(`${TAG} Moonlight ${MOONLIGHT_VERSION} already vendored.`);
    return;
  }

  if (needMoonlight) {
    console.log(`${TAG} Downloading Moonlight ${MOONLIGHT_VERSION}…`);
    const zipPath = path.join(outDir, "moonlight.zip");
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

    // Moonlight portable zip may extract as Moonlight.exe or moonlight.exe or in a subfolder;
    // ensure moonlight.exe is directly in outDir
    const rootExe = path.join(outDir, "Moonlight.exe");
    const lowerExe = path.join(outDir, "moonlight.exe");
    if (fs.existsSync(rootExe) && !fs.existsSync(lowerExe)) {
      try {
        fs.copyFileSync(rootExe, lowerExe);
      } catch {
        /* ignore */
      }
    }

    fs.writeFileSync(versionPath, `${MOONLIGHT_VERSION}\n`);
    console.log(`${TAG} Vendored Moonlight to ${outDir}`);
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
