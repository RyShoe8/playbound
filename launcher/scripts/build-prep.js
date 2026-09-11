/**
 * Shared prep steps for every platform before electron-builder runs.
 * Mirrors the catalog / cadence / syntax steps in build-windows.js so
 * Mac and Linux ship the same bundled catalog as Windows.
 */
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const TAG = "[build-prep]";
const launcherDir = path.join(__dirname, "..");

function run(label, scriptPath) {
  console.log(`${TAG} → ${label}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: launcherDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

function main() {
  run("Syncing game catalog", path.join(__dirname, "sync-catalog.js"));
  run("Syncing poll cadences", path.join(__dirname, "sync-cadence.js"));
  run("Checking launcher syntax", path.join(__dirname, "check-launcher-syntax.js"));
  console.log(`${TAG} Prep complete.`);
}

main();
