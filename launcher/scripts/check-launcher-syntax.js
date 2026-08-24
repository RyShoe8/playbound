"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const launcherDir = path.join(__dirname, "..");
const files = ["bootstrap.js", "main.js", "preload.js"];

for (const file of files) {
  const fullPath = path.join(launcherDir, file);
  const result = spawnSync(process.execPath, ["--check", fullPath], {
    cwd: launcherDir,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`[check-launcher-syntax] OK: ${files.join(", ")}`);
