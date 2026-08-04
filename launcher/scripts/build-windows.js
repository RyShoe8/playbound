/**
 * build-windows.js
 *
 * Orchestrates a Windows build end to end:
 *
 *     sync catalog  →  build + sign  →  verify signatures  →  done
 *
 * Two modes:
 *
 *   --dev    Development build. Never signed, even on a machine that holds a
 *            certificate. Fast, and the artifacts are clearly not for release.
 *
 *   --prod   Production build. Signing is REQUIRED: the build fails if
 *            credentials are missing, if signing fails, or if any shipped
 *            binary fails signature verification afterwards.
 *
 * Environment variables are set here rather than inline in package.json
 * because `VAR=value cmd` is not valid on Windows shells, and adding cross-env
 * just for this would be a dependency for something Node can do directly.
 *
 * An explicit WINDOWS_SIGNING_ENABLED in the environment is respected in
 * --prod (so CI can't be silently downgraded) but overridden in --dev.
 */

"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const TAG = "[build-windows]";
const launcherDir = path.join(__dirname, "..");

function parseMode(argv) {
  if (argv.includes("--prod") || argv.includes("--production")) return "prod";
  if (argv.includes("--dev") || argv.includes("--development")) return "dev";
  return null;
}

/** Run a Node script in-process-tree, inheriting stdio, failing fast. */
function run(label, scriptPath, args, env) {
  console.log(`${TAG} → ${label}`);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: launcherDir,
    stdio: "inherit",
    env,
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

function main() {
  const mode = parseMode(process.argv.slice(2));
  if (!mode) {
    console.error(`${TAG} ERROR: specify --dev or --prod.`);
    console.error(`${TAG}   npm run dist:dev    unsigned development build`);
    console.error(`${TAG}   npm run dist:prod   signed production release`);
    process.exit(1);
  }

  const env = { ...process.env };

  if (mode === "dev") {
    env.WINDOWS_SIGNING_ENABLED = "false";
    console.log(`${TAG} Mode: DEVELOPMENT — artifacts will be unsigned.`);
  } else {
    // Respect an explicit "false" only if someone deliberately set it; otherwise
    // production always demands a signature.
    if (env.WINDOWS_SIGNING_ENABLED == null || env.WINDOWS_SIGNING_ENABLED.trim() === "") {
      env.WINDOWS_SIGNING_ENABLED = "true";
    }
    console.log(`${TAG} Mode: PRODUCTION — signing required (WINDOWS_SIGNING_ENABLED=${env.WINDOWS_SIGNING_ENABLED}).`);
  }

  // 1. Refresh the bundled offline catalog. This mirrors the `predist` hook,
  //    which npm does not run for dist:dev / dist:prod.
  run("Syncing game catalog", path.join(__dirname, "sync-catalog.js"), [], env);

  // 2. Build. electron-builder.config.js reads the same env vars and decides
  //    whether to sign; forceCodeSigning makes a failed signing attempt fatal.
  const cliPath = require.resolve("electron-builder/cli.js", { paths: [launcherDir] });
  run("Building Windows artifacts", cliPath, ["--win"], env);

  // 3. Prove it. A production build that somehow emitted unsigned binaries
  //    must not be publishable.
  if (mode === "prod") {
    run(
      "Verifying signatures",
      path.join(__dirname, "verify-signatures.js"),
      ["--required"],
      env
    );
    console.log("");
    console.log(`${TAG} Production build complete — artifacts are signed and verified.`);
    console.log(`${TAG} Output: ${path.join(launcherDir, "dist")}`);
  } else {
    console.log("");
    console.log(`${TAG} Development build complete (UNSIGNED — do not distribute).`);
    console.log(`${TAG} Output: ${path.join(launcherDir, "dist")}`);
  }
}

try {
  main();
} catch (err) {
  console.error("");
  console.error(`${TAG} ERROR: ${err && err.message ? err.message : err}`);
  process.exit(1);
}
