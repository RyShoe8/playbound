/**
 * verify-signatures.js
 *
 * Post-build gate: proves every Windows binary we ship is actually signed.
 *
 * electron-builder's `forceCodeSigning` catches the case where signing was
 * never attempted, but it does not tell you whether the resulting signature is
 * trusted, timestamped, or applied to every file that reaches a user's disk.
 * This script checks the artifacts themselves.
 *
 * Two classes of file are verified:
 *
 *   Shipped artifacts   dist/*.exe — the installer and portable build that
 *                       users actually download. These are what SmartScreen
 *                       and the browser download warning look at.
 *
 *   App payload         dist/win-unpacked/** — the executables and native
 *                       binaries the installer writes to disk. An unsigned
 *                       payload inside a signed installer still trips
 *                       enterprise allow-listing and some AV heuristics.
 *
 * Usage:
 *   node scripts/verify-signatures.js [--dist <dir>] [--required]
 *
 * Exits non-zero when signing was required and any check failed.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { resolveSigningConfig, runPowerShellJson } = require("./signing-config");

const TAG = "[verify-signatures]";

/** Extensions that must carry a signature when they ship inside the app. */
const EXECUTABLE_EXTS = new Set([".exe"]);
const NATIVE_EXTS = new Set([".dll", ".node"]);

/** Never signed, never shipped as executable code — noise if reported. */
const IGNORED_EXTS = new Set([
  ".blockmap",
  ".yml",
  ".yaml",
  ".json",
  ".txt",
  ".md",
  ".pak",
  ".dat",
  ".bin",
  ".asar",
  ".icns",
  ".ico",
  ".png",
  ".html",
  ".js",
  ".css",
  ".map",
]);

/**
 * Trim PowerShell's StatusMessage down to the part that matters.
 *
 * Get-AuthenticodeSignature reports NotSigned with a stock message that tacks
 * on advice about script execution policy — irrelevant here, and it turns a
 * 10-file failure list into an unreadable wall in CI logs.
 */
function cleanStatusMessage(status, message) {
  if (!message) return "";
  if (status === "NotSigned") return "not digitally signed";
  const cut = message.indexOf("You cannot run this script");
  return (cut === -1 ? message : message.slice(0, cut)).trim();
}

function parseArgs(argv) {
  const args = { dist: null, required: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dist" && argv[i + 1]) {
      args.dist = argv[++i];
    } else if (argv[i] === "--required") {
      args.required = true;
    } else if (argv[i] === "--optional") {
      args.required = false;
    }
  }
  return args;
}

/** Recursively collect files under `dir`. */
function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Decide which files must be verified.
 *
 * @param {string} distDir
 * @param {boolean} includeNative whether .dll/.node were signed too
 */
function collectTargets(distDir, includeNative) {
  /** @type {{ path: string, kind: string }[]} */
  const targets = [];

  // Shipped artifacts: top-level .exe only (installer + portable).
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (path.extname(entry.name).toLowerCase() === ".exe") {
      targets.push({ path: path.join(distDir, entry.name), kind: "shipped artifact" });
    }
  }

  // App payload: everything the installer unpacks onto the user's machine.
  const unpacked = path.join(distDir, "win-unpacked");
  if (fs.existsSync(unpacked)) {
    for (const file of walk(unpacked)) {
      const ext = path.extname(file).toLowerCase();
      if (IGNORED_EXTS.has(ext)) continue;
      if (EXECUTABLE_EXTS.has(ext)) {
        targets.push({ path: file, kind: "app payload (executable)" });
      } else if (includeNative && NATIVE_EXTS.has(ext)) {
        targets.push({ path: file, kind: "app payload (native binary)" });
      }
    }
  }

  return targets;
}

/**
 * Query Authenticode status for a batch of files via PowerShell.
 *
 * Paths are handed over in a temp JSON file and the script is passed as a
 * base64 -EncodedCommand, so no path content is ever interpolated into a
 * command line — spaces, quotes and ampersands in paths cannot break it or
 * inject anything.
 */
function getSignatureInfo(files) {
  const listFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pb-verify-")),
    "targets.json"
  );
  fs.writeFileSync(listFile, JSON.stringify(files), "utf8");

  const psScript = `
$ErrorActionPreference = 'Stop'
$targets = Get-Content -LiteralPath '${listFile.replace(/'/g, "''")}' -Raw | ConvertFrom-Json
$results = foreach ($p in $targets) {
  try {
    $sig = Get-AuthenticodeSignature -LiteralPath $p
    [PSCustomObject]@{
      path         = $p
      status       = $sig.Status.ToString()
      message      = $sig.StatusMessage
      subject      = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
      thumbprint   = if ($sig.SignerCertificate) { $sig.SignerCertificate.Thumbprint } else { $null }
      notAfter     = if ($sig.SignerCertificate) { $sig.SignerCertificate.NotAfter.ToString('o') } else { $null }
      timestamped  = [bool]$sig.TimeStamperCertificate
    }
  } catch {
    [PSCustomObject]@{
      path = $p; status = 'VerifyError'; message = $_.Exception.Message
      subject = $null; thumbprint = $null; notAfter = $null; timestamped = $false
    }
  }
}
ConvertTo-Json -InputObject @($results) -Depth 4 -Compress
`;

  try {
    return runPowerShellJson(psScript);
  } finally {
    fs.rmSync(path.dirname(listFile), { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const distDir = path.resolve(args.dist || path.join(__dirname, "..", "dist"));

  const signing = resolveSigningConfig();
  // --required/--optional override the environment so the production build
  // script can enforce verification regardless of how signing was detected.
  const required = args.required != null ? args.required : signing.required;

  if (!fs.existsSync(distDir)) {
    console.error(`${TAG} ERROR: dist directory not found: ${distDir}`);
    console.error(`${TAG} Run a build first (npm run dist).`);
    process.exit(1);
  }

  // If signing was never on, there is nothing to verify. Only complain when the
  // caller expected signed output.
  if (!signing.enabled && !required) {
    console.log(`${TAG} Signing is disabled — skipping verification (unsigned build).`);
    process.exit(0);
  }

  if (process.platform !== "win32") {
    const msg =
      "Signature verification uses Get-AuthenticodeSignature and requires Windows. " +
      `Current platform is "${process.platform}".`;
    if (required) {
      console.error(`${TAG} ERROR: ${msg}`);
      console.error(`${TAG} Run production Windows releases on a Windows machine or runner.`);
      process.exit(1);
    }
    console.warn(`${TAG} WARNING: ${msg} Skipping.`);
    process.exit(0);
  }

  const targets = collectTargets(distDir, signing.signAllBinaries);
  if (targets.length === 0) {
    console.error(`${TAG} ERROR: no Windows binaries found under ${distDir}`);
    process.exit(required ? 1 : 0);
  }

  console.log(`${TAG} Verifying ${targets.length} binary/binaries in ${distDir}`);

  const infoByPath = new Map();
  for (const info of getSignatureInfo(targets.map((t) => t.path))) {
    infoByPath.set(path.resolve(info.path), info);
  }

  // Optional guard against signing with the wrong certificate — easy to do on a
  // machine that holds more than one. Opt-in, because the exact subject string
  // is only known once the CA has issued (e.g. "The Media Shop, LLC").
  const expectedPublisher = (process.env.WINDOWS_EXPECTED_PUBLISHER || "").trim();

  const failures = [];
  const untrusted = [];
  const notTimestamped = [];
  const wrongPublisher = [];
  let signerSubject = null;

  for (const target of targets) {
    const info = infoByPath.get(path.resolve(target.path));
    const rel = path.relative(distDir, target.path) || path.basename(target.path);

    if (!info) {
      failures.push({ rel, kind: target.kind, status: "NoResult", message: "No verification result returned." });
      continue;
    }

    if (info.status === "Valid") {
      if (!info.timestamped) notTimestamped.push(rel);
      if (!signerSubject && info.subject) signerSubject = info.subject;
      // Only enforced on binaries we produce. Electron ships some third-party
      // binaries that arrive already signed by their vendor (d3dcompiler_47.dll
      // is Microsoft-signed), so a differing publisher there is expected.
      if (
        expectedPublisher &&
        info.subject &&
        !target.kind.includes("native") &&
        !info.subject.toLowerCase().includes(expectedPublisher.toLowerCase())
      ) {
        wrongPublisher.push({ rel, subject: info.subject });
      }
      console.log(`  OK        ${rel}${info.timestamped ? "" : "  (NOT timestamped)"}`);
      continue;
    }

    // A self-signed or internally-issued certificate produces a valid signature
    // that simply does not chain to a trusted root on this machine. That is the
    // expected result when testing the pipeline before buying a real cert, so
    // it can be downgraded to a warning deliberately.
    if ((info.status === "UnknownError" || info.status === "NotTrusted") && signing.allowUntrusted) {
      if (!signerSubject && info.subject) signerSubject = info.subject;
      untrusted.push(rel);
      console.warn(`  UNTRUSTED ${rel}  (${info.status}: chain not trusted — allowed by WINDOWS_SIGNING_ALLOW_UNTRUSTED)`);
      continue;
    }

    failures.push({
      rel,
      kind: target.kind,
      status: info.status,
      message: cleanStatusMessage(info.status, info.message),
    });
    console.error(`  FAILED    ${rel}  (${info.status})`);
  }

  console.log("");

  if (notTimestamped.length > 0) {
    console.warn(
      `${TAG} WARNING: ${notTimestamped.length} file(s) are signed but NOT timestamped. ` +
        "Those signatures stop validating the moment the certificate expires. " +
        "Check that the timestamp server is reachable from this machine."
    );
  }

  if (wrongPublisher.length > 0) {
    console.error(
      `${TAG} ERROR: ${wrongPublisher.length} artifact(s) are signed by an unexpected publisher ` +
        `(WINDOWS_EXPECTED_PUBLISHER="${expectedPublisher}"):`
    );
    for (const w of wrongPublisher) {
      console.error(`  - ${w.rel} → ${w.subject}`);
    }
    console.error(
      `${TAG} This usually means the machine holds more than one code-signing certificate ` +
        "and the wrong one was selected. Check WINDOWS_CERT_SHA1 / WINDOWS_CERT_PATH."
    );
    if (required) {
      process.exit(1);
    }
  }

  if (failures.length > 0) {
    console.error(`${TAG} ${failures.length} of ${targets.length} binary/binaries failed verification:`);
    for (const f of failures) {
      console.error(`  - ${f.rel} [${f.kind}] → ${f.status}${f.message ? `: ${f.message}` : ""}`);
    }
    console.error("");
    if (required) {
      console.error(`${TAG} BUILD FAILED — signing was required but these artifacts are not properly signed.`);
      process.exit(1);
    }
    console.warn(`${TAG} Signing was not required, so this is a warning rather than a failure.`);
    process.exit(0);
  }

  const signedCount = targets.length - untrusted.length;

  // Signings are metered (SSL.com eSigner: 240/year), so report the cost of
  // this build. The NSIS uninstaller is signed during packaging and embedded
  // into the installer, so it is spent but no longer on disk to verify —
  // count it explicitly rather than under-reporting.
  const verifiedOurs = targets.filter((t) => !t.kind.includes("native")).length;
  const nativesSigned = signing.signAllBinaries
    ? targets.filter((t) => t.kind.includes("native")).length
    : 0;
  const signingsUsed = verifiedOurs + nativesSigned + 1; // +1 = embedded uninstaller

  console.log(`${TAG} ==========================================================`);
  console.log(`${TAG}  SUCCESS — all ${targets.length} Windows binaries are signed`);
  if (signerSubject) {
    console.log(`${TAG}  Signer: ${signerSubject}`);
  }
  console.log(
    `${TAG}  Valid: ${signedCount}` +
      (untrusted.length ? ` · untrusted-but-allowed: ${untrusted.length}` : "") +
      (notTimestamped.length ? ` · missing timestamp: ${notTimestamped.length}` : " · all timestamped")
  );
  console.log(`${TAG}  Signings consumed by this build: ~${signingsUsed}`);
  console.log(`${TAG} ==========================================================`);
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error(`${TAG} ERROR: ${err && err.message ? err.message : err}`);
  process.exit(1);
}
