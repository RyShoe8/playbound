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
const fs = require("fs");
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

    /*
     * verify-signatures.js checks every top-level .exe it finds in dist/ — it
     * has no idea which ones this run actually produced. A --dev build never
     * signs anything, so an unsigned installer from a prior rehearsal build
     * left sitting in dist/ is invisible right up until the next --prod run,
     * which inherits it, fails signature verification on a file it never
     * touched, and does so *after* electron-builder already spent real
     * signings on the artifacts that were actually built. A failed build
     * still consumes those signings — see docs/windows-code-signing.md — so
     * this was not a cosmetic bug, it was a way to burn signing budget for
     * nothing. A production build now always starts from a clean directory.
     */
    const distDir = path.join(launcherDir, "dist");
    if (fs.existsSync(distDir)) {
      console.log(`${TAG} Clearing ${distDir} so verification only sees this build's artifacts.`);
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  }

  // 1. Vendor ViGEmBus redistributable (skipped if already pinned).
  run("Vendoring ViGEmBus setup", path.join(__dirname, "vendor-vigem.js"), [], env);

  // 1b. Vendor NetBird MSI for silent overlay-network install.
  run("Vendoring NetBird setup", path.join(__dirname, "vendor-netbird.js"), [], env);

  // 2. Vendor Nefarius.ViGEm.Client.dll for the PowerShell host (if missing).
  run("Vendoring ViGEm client DLL", path.join(__dirname, "vendor-vigem-client.js"), [], env);

  // 3. Optionally build .NET host when SDK is present (not required for shipping).
  if (process.platform === "win32") {
    const optional = spawnSync(process.execPath, [path.join(__dirname, "build-vigem-host.js")], {
      cwd: launcherDir,
      stdio: "inherit",
      env,
    });
    if (optional.status !== 0) {
      console.log(`${TAG} .NET ViGEm host build skipped/failed — using PowerShell host.`);
    }
  }

  // 4. Refresh the bundled offline catalog. This mirrors the `predist` hook,
  //    which npm does not run for dist:dev / dist:prod.
  run("Syncing game catalog", path.join(__dirname, "sync-catalog.js"), [], env);

  // 4b. Regenerate services/cadence.js from the website's canonical
  //     cadence.json, so both clients poll at the same intervals. Soft-fails
  //     and keeps the committed copy when platform/ is not in the checkout.
  run("Syncing poll cadences", path.join(__dirname, "sync-cadence.js"), [], env);

  // 5. Refuse to package JavaScript that Electron cannot parse. A malformed
  //    main.js otherwise produces a valid-looking installer that replaces the
  //    working app and then fails before the first window can open.
  run("Checking launcher syntax", path.join(__dirname, "check-launcher-syntax.js"), [], env);

  // 6. Build. electron-builder.config.js reads the same env vars and decides
  //    whether to sign; forceCodeSigning makes a failed signing attempt fatal.
  const cliPath = require.resolve("electron-builder/cli.js", { paths: [launcherDir] });
  run("Building Windows artifacts", cliPath, ["--win"], env);

  // 7. Prove it. A production build that somehow emitted unsigned binaries
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
