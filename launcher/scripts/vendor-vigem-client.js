/**
 * Ensures the ViGEm client DLL is present under resources/vigem/lib/.
 * Prefer committing the DLL; this script can refresh it from NuGet.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");

const TAG = "[vendor-vigem-client]";
const VERSION = "1.21.256";
const NUPKG_URL = `https://api.nuget.org/v3-flatcontainer/nefarius.vigem.client/${VERSION}/nefarius.vigem.client.${VERSION}.nupkg`;
const outDll = path.join(
  __dirname,
  "..",
  "resources",
  "vigem",
  "lib",
  "Nefarius.ViGEm.Client.dll"
);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u, n = 0) => {
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && n < 5) {
            res.resume();
            get(res.headers.location, n + 1);
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
        .on("error", reject);
    };
    get(url);
  });
}

async function main() {
  if (fs.existsSync(outDll) && fs.statSync(outDll).size > 10_000) {
    console.log(`${TAG} DLL already present.`);
    return;
  }
  const tmpDir = path.join(__dirname, "..", "tools", "vigem-host", "nuget-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const nupkg = path.join(tmpDir, "client.nupkg");
  const zip = path.join(tmpDir, "client.zip");
  console.log(`${TAG} Downloading Nefarius.ViGEm.Client ${VERSION}…`);
  await download(NUPKG_URL, nupkg);
  fs.copyFileSync(nupkg, zip);
  const extractDir = path.join(tmpDir, "extracted");
  fs.rmSync(extractDir, { recursive: true, force: true });
  const expand = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path ${JSON.stringify(zip)} -DestinationPath ${JSON.stringify(extractDir)} -Force`,
    ],
    { stdio: "inherit" }
  );
  if (expand.status !== 0) throw new Error("Failed to extract nupkg");
  const src = path.join(
    extractDir,
    "lib",
    "netstandard2.0",
    "Nefarius.ViGEm.Client.dll"
  );
  if (!fs.existsSync(src)) throw new Error("DLL not found in nupkg");
  fs.mkdirSync(path.dirname(outDll), { recursive: true });
  fs.copyFileSync(src, outDll);
  console.log(`${TAG} Wrote ${outDll}`);
}

main().catch((err) => {
  console.error(`${TAG} ERROR: ${err.message || err}`);
  process.exit(1);
});
