/**
 * signing-status.js
 *
 * Diagnostic: report how Windows code signing would resolve right now, without
 * building anything.
 *
 *     npm run signing:status
 *
 * This is the first thing to run after installing a certificate or setting
 * environment variables — it answers "is my machine set up to sign?" in a
 * couple of seconds instead of after a full build.
 *
 * Secrets are never printed. Passwords are shown only as set/not set, and
 * thumbprints are truncated.
 */

"use strict";

const { resolveSigningConfig, runPowerShellJson } = require("./signing-config");

const TAG = "[signing:status]";

/** Report whether an env var is set, without revealing a secret value. */
function describe(name, { secret = false } = {}) {
  const raw = process.env[name];
  const value = raw == null ? "" : String(raw).trim();
  if (value === "") return `${name.padEnd(32)} (not set)`;
  if (secret) return `${name.padEnd(32)} (set, ${value.length} chars — hidden)`;
  return `${name.padEnd(32)} ${value}`;
}

/** List code-signing certificates available in the user's Windows store. */
function listStoreCertificates() {
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$certs = Get-ChildItem -Path Cert:\\CurrentUser\\My, Cert:\\LocalMachine\\My |
  Where-Object { $_.EnhancedKeyUsageList.FriendlyName -contains 'Code Signing' }
$out = foreach ($c in $certs) {
  [PSCustomObject]@{
    thumbprint = $c.Thumbprint
    subject    = $c.Subject
    notAfter   = $c.NotAfter.ToString('yyyy-MM-dd')
    hasKey     = $c.HasPrivateKey
  }
}
ConvertTo-Json -InputObject @($out) -Depth 3 -Compress
`;
  try {
    return runPowerShellJson(psScript);
  } catch {
    // Certificate enumeration is a convenience, never a hard requirement.
    return [];
  }
}

function main() {
  console.log("");
  console.log("PlayBound — Windows code signing status");
  console.log("=".repeat(60));
  console.log("");
  console.log("Environment:");
  console.log("  " + describe("WINDOWS_SIGNING_ENABLED"));
  console.log("  " + describe("WINDOWS_CERT_SHA1"));
  console.log("  " + describe("WINDOWS_CERT_SUBJECT_NAME"));
  console.log("  " + describe("WINDOWS_CERT_PATH"));
  console.log("  " + describe("WINDOWS_CERT_PASSWORD", { secret: true }));
  console.log("  " + describe("WINDOWS_TIMESTAMP_SERVER"));
  console.log("  " + describe("WINDOWS_PUBLISHER_NAME"));
  console.log("  " + describe("WINDOWS_SIGN_ALL_BINARIES"));
  console.log("  " + describe("WINDOWS_SIGNING_ALLOW_UNTRUSTED"));
  console.log("  " + describe("CSC_LINK"));
  console.log("  " + describe("WIN_CSC_LINK"));
  console.log("");

  let config;
  try {
    config = resolveSigningConfig();
  } catch (err) {
    console.error(`${TAG} Configuration error: ${err.message}`);
    process.exit(1);
  }

  console.log("Resolved:");
  console.log(`  Mode          ${config.mode}`);
  console.log(`  Signing       ${config.enabled ? "ENABLED" : "disabled"}`);
  console.log(`  Required      ${config.required ? "yes — build fails if signing fails" : "no — unsigned build allowed"}`);
  console.log(`  Detail        ${config.reason}`);
  if (config.enabled) {
    console.log(`  Sign natives  ${config.signAllBinaries ? "yes (.dll, .node)" : "no (executables only)"}`);
  }
  console.log("");

  // Signings are a metered resource on the SSL.com eSigner plan (240/year,
  // ~20/month, unused roll over). Make the per-release cost visible here so the
  // budget is a decision rather than a surprise at renewal.
  const perBuild = config.signAllBinaries ? 11 : 5;
  console.log("Signing budget (SSL.com eSigner — 240/year, ~20/month, rolls over):");
  console.log(`  ~${perBuild} signings per release build (installer, portable, app exe, elevate, uninstaller` +
    `${config.signAllBinaries ? ", + bundled native binaries" : ""})`);
  console.log(`  ≈ ${Math.floor(240 / perBuild)} releases/year at this setting`);
  if (config.signAllBinaries) {
    console.log("  Unset WINDOWS_SIGN_ALL_BINARIES to drop to ~5/build (≈48 releases/year).");
  }
  console.log("  Failed builds still consume signings — use `npm run dist:dev` to rehearse.");
  console.log("");

  for (const warning of config.warnings) {
    console.warn(`  WARNING: ${warning}`);
  }
  for (const error of config.errors) {
    console.error(`  ERROR:   ${error}`);
  }
  if (config.warnings.length || config.errors.length) console.log("");

  if (process.platform === "win32") {
    const certs = listStoreCertificates();
    console.log(`Code-signing certificates in this machine's store: ${certs.length}`);
    for (const cert of certs) {
      const key = cert.hasKey ? "private key present" : "NO private key";
      console.log(`  ${cert.thumbprint}  expires ${cert.notAfter}  (${key})`);
      console.log(`      ${cert.subject}`);
    }
    if (certs.length === 0) {
      console.log("  (none found — expected until a certificate is installed)");
    }
    console.log("");
  }

  if (config.errors.length > 0) {
    console.log("Result: configuration is INVALID. See errors above.");
    process.exit(1);
  }
  if (config.enabled) {
    console.log("Result: ready to sign. `npm run dist:prod` will produce signed artifacts.");
  } else {
    console.log("Result: no signing configured. `npm run dist` still works and emits unsigned artifacts.");
    console.log("        See docs/windows-code-signing.md to set up a certificate.");
  }
  console.log("");
}

main();
