/**
 * signing-config.js
 *
 * Single source of truth for Windows code-signing configuration.
 *
 * Both the electron-builder config (electron-builder.config.js) and the
 * post-build verifier (scripts/verify-signatures.js) resolve signing state
 * through here, so there is exactly one place that decides "are we signing,
 * with what, and is it mandatory?".
 *
 * Nothing in here is secret. Every credential arrives via environment
 * variable — no certificate path, thumbprint, or password is ever hardcoded
 * or committed. See docs/windows-code-signing.md.
 *
 * ---------------------------------------------------------------------------
 * Signing modes (auto-detected, in priority order)
 * ---------------------------------------------------------------------------
 *   "store"    EV certificate held in the Windows certificate store, usually
 *              backed by a hardware token or HSM. Selected by thumbprint
 *              (WINDOWS_CERT_SHA1) or subject name (WINDOWS_CERT_SUBJECT_NAME).
 *              The private key never leaves the token, so there is no file
 *              and no password.
 *
 *   "pfx"      Standard (OV) certificate as a .pfx/.p12 file on disk, via
 *              WINDOWS_CERT_PATH + WINDOWS_CERT_PASSWORD.
 *
 *   "csc"      electron-builder's own CSC_LINK / WIN_CSC_LINK convention,
 *              recognised so existing CI recipes keep working. electron-builder
 *              consumes those variables directly; we only report the mode.
 *
 *   "disabled" No credentials found, or signing explicitly turned off.
 *
 * ---------------------------------------------------------------------------
 * WINDOWS_SIGNING_ENABLED
 * ---------------------------------------------------------------------------
 *   unset / "auto"   Never sign, regardless of what credentials are present.
 *                    Signing is opt-in: this machine holds real EV
 *                    credentials, so any invocation that doesn't explicitly
 *                    ask for signing — including a bare `electron-builder`
 *                    call that bypasses scripts/build-windows.js — must not
 *                    silently spend a metered signing.
 *
 *   "true" / "1"     Signing is REQUIRED. Missing credentials, a signing
 *                    failure, or a failed signature verification all fail the
 *                    build. Production releases and CI use this.
 *
 *   "false" / "0"    Never sign, even if credentials happen to be present.
 *                    Useful for fast local iteration on a signing machine.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

/** Default RFC 3161 timestamp server. Overridable via WINDOWS_TIMESTAMP_SERVER. */
const DEFAULT_TIMESTAMP_SERVER = "http://timestamp.digicert.com";

/**
 * File extensions signed in addition to the main .exe, when explicitly enabled.
 *
 * Electron ships native binaries (ffmpeg.dll, libEGL.dll, *.node addons) that
 * land on the user's disk alongside the app. Signing them helps with enterprise
 * allow-listing and some AV heuristics.
 *
 * OFF BY DEFAULT, because signing is a metered resource here: PlayBound signs
 * through SSL.com eSigner, whose plan allows 240 signings per year (~20/month).
 * Including these six-or-so DLLs takes a release from ~5 signings to ~11 —
 * roughly 21 releases a year instead of 48. They are stock Electron binaries
 * rather than our code, so the trade is rarely worth it.
 *
 * Set WINDOWS_SIGN_ALL_BINARIES=true to include them.
 */
const EXTRA_SIGN_EXTS = [".dll", ".node"];

function readEnv(name) {
  const raw = process.env[name];
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  // Treat quoted-empty and literal "undefined" (a common CI templating slip)
  // as absent rather than as a real value.
  if (trimmed === "" || trimmed === "undefined" || trimmed === "null") return "";
  return trimmed;
}

/** Parse a tri-state boolean env var: true / false / unset. */
function readTriState(name) {
  const value = readEnv(name).toLowerCase();
  if (value === "") return null;
  if (["true", "1", "yes", "on", "required"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  if (value === "auto") return null;
  throw new Error(
    `${name} must be one of: true, false, auto (got "${process.env[name]}").`
  );
}

/**
 * Normalise a certificate thumbprint.
 *
 * Windows shows thumbprints with spaces ("a1 b2 c3 …") and copying from
 * certmgr.msc can prepend an invisible U+200E left-to-right mark. signtool
 * accepts only bare hex, so strip everything that isn't a hex digit — this is
 * the single most common reason an otherwise-correct EV setup fails.
 */
function normaliseThumbprint(raw) {
  return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

/**
 * Resolve signing configuration from the environment.
 *
 * Pure with respect to the filesystem apart from an existence check on the
 * .pfx, and never throws for "no credentials" — that is a valid state.
 *
 * @returns {{
 *   mode: "store"|"pfx"|"csc"|"disabled",
 *   enabled: boolean,
 *   required: boolean,
 *   reason: string,
 *   errors: string[],
 *   warnings: string[],
 *   signtoolOptions: object|null,
 *   publisherName: string|null,
 *   signAllBinaries: boolean,
 *   allowUntrusted: boolean,
 * }}
 */
function resolveSigningConfig() {
  const warnings = [];
  const errors = [];

  const explicit = readTriState("WINDOWS_SIGNING_ENABLED");
  const required = explicit === true;

  const certSha1Raw = readEnv("WINDOWS_CERT_SHA1");
  const certSubject = readEnv("WINDOWS_CERT_SUBJECT_NAME");
  const certPath = readEnv("WINDOWS_CERT_PATH");
  const certPassword = readEnv("WINDOWS_CERT_PASSWORD");
  const cscLink = readEnv("WIN_CSC_LINK") || readEnv("CSC_LINK");

  const timestampServer = readEnv("WINDOWS_TIMESTAMP_SERVER") || DEFAULT_TIMESTAMP_SERVER;
  const publisherName = readEnv("WINDOWS_PUBLISHER_NAME") || null;
  // Opt-in, not opt-out — see EXTRA_SIGN_EXTS. Signings are a metered resource.
  const signAllBinaries = readTriState("WINDOWS_SIGN_ALL_BINARIES") === true;
  const allowUntrusted = readTriState("WINDOWS_SIGNING_ALLOW_UNTRUSTED") === true;

  const disabled = (reason) => ({
    mode: "disabled",
    enabled: false,
    required,
    reason,
    errors,
    warnings,
    signtoolOptions: null,
    publisherName,
    signAllBinaries,
    allowUntrusted,
  });

  // Explicit opt-out always wins, so a developer on a signing-capable machine
  // can still produce a fast unsigned build.
  if (explicit === false) {
    return disabled("WINDOWS_SIGNING_ENABLED=false — signing explicitly disabled.");
  }

  // Signing is opt-in, not auto-detected. This machine holds real EV
  // credentials for legitimate signed releases, so a bare `electron-builder`
  // invocation that bypassed scripts/build-windows.js — a stray CI recipe, a
  // manual `npx electron-builder`, anything that doesn't go through --dev or
  // --prod — must not silently start consuming metered signings just because
  // the credentials happen to be sitting in the environment. Only an explicit
  // WINDOWS_SIGNING_ENABLED=true turns signing on.
  if (!required) {
    return disabled("WINDOWS_SIGNING_ENABLED is not explicitly \"true\" — producing an unsigned build.");
  }

  const hasStoreCreds = Boolean(certSha1Raw || certSubject);
  const hasPfxCreds = Boolean(certPath);
  const hasCscCreds = Boolean(cscLink);

  if (!hasStoreCreds && !hasPfxCreds && !hasCscCreds) {
    errors.push(
      "WINDOWS_SIGNING_ENABLED=true but no signing credentials were found. " +
        "Set WINDOWS_CERT_SHA1 (EV / cert store) or WINDOWS_CERT_PATH (.pfx file)."
    );
    return disabled("No signing credentials in the environment — producing an unsigned build.");
  }

  /** @type {Record<string, unknown>} */
  const signtoolOptions = {
    // sha1+sha256 dual signing is legacy; sha256 alone is correct for every
    // supported Windows version and avoids a redundant second signature.
    signingHashAlgorithms: ["sha256"],
    rfc3161TimeStampServer: timestampServer,
    timeStampServer: timestampServer,
  };
  if (publisherName) {
    signtoolOptions.publisherName = publisherName;
  }

  let mode;
  let reason;

  if (hasStoreCreds) {
    mode = "store";
    if (certSha1Raw) {
      const thumbprint = normaliseThumbprint(certSha1Raw);
      if (thumbprint.length !== 40) {
        errors.push(
          `WINDOWS_CERT_SHA1 should be a 40-character SHA-1 thumbprint; got ${thumbprint.length} ` +
            `hex character(s) after stripping separators. Copy the "Thumbprint" field from ` +
            `certmgr.msc, or run: Get-ChildItem Cert:\\CurrentUser\\My | Select Thumbprint, Subject`
        );
      }
      signtoolOptions.certificateSha1 = thumbprint;
      reason = `EV / certificate-store signing by thumbprint (${thumbprint.slice(0, 8)}…).`;
    }
    if (certSubject) {
      signtoolOptions.certificateSubjectName = certSubject;
      if (!certSha1Raw) {
        reason = `EV / certificate-store signing by subject name ("${certSubject}").`;
      }
    }
    if (certPath) {
      warnings.push(
        "Both a certificate-store selector and WINDOWS_CERT_PATH are set. " +
          "Using the certificate store and ignoring the .pfx file."
      );
    }
    if (process.platform !== "win32") {
      errors.push(
        `Certificate-store signing requires Windows; current platform is "${process.platform}". ` +
          "Use a .pfx via WINDOWS_CERT_PATH, or build on a Windows runner."
      );
    }
  } else if (hasPfxCreds) {
    mode = "pfx";
    const resolved = path.resolve(certPath);
    if (!fs.existsSync(resolved)) {
      errors.push(`WINDOWS_CERT_PATH does not exist: ${resolved}`);
    } else if (!fs.statSync(resolved).isFile()) {
      errors.push(`WINDOWS_CERT_PATH is not a file: ${resolved}`);
    }
    if (!certPassword) {
      // Not fatal — a .pfx can legitimately carry an empty password — but it is
      // almost always a missing-secret mistake, so say so loudly.
      warnings.push(
        "WINDOWS_CERT_PASSWORD is not set. Continuing on the assumption the .pfx has an " +
          "empty password; if signing fails with a password error, this is why."
      );
    }
    signtoolOptions.certificateFile = resolved;
    signtoolOptions.certificatePassword = certPassword;
    reason = `Standard certificate signing from .pfx (${path.basename(resolved)}).`;
  } else {
    // electron-builder reads CSC_LINK / CSC_KEY_PASSWORD itself. We deliberately
    // pass no certificate fields so we don't fight it for control.
    mode = "csc";
    reason = "Signing via electron-builder's CSC_LINK / WIN_CSC_LINK convention.";
  }

  return {
    mode,
    enabled: true,
    required,
    reason,
    errors,
    warnings,
    signtoolOptions,
    publisherName,
    signAllBinaries,
    allowUntrusted,
  };
}

/**
 * Print the resolved signing state and enforce it.
 *
 * Errors are only fatal when signing is REQUIRED. In auto mode a broken or
 * partial configuration downgrades to an unsigned build with a warning, so a
 * developer without a certificate is never blocked.
 *
 * @param {ReturnType<typeof resolveSigningConfig>} config
 * @param {{ label?: string }} [opts]
 * @returns {boolean} whether signing should actually be applied
 */
function reportSigningConfig(config, opts = {}) {
  const label = opts.label || "signing";
  const tag = `[${label}]`;

  for (const warning of config.warnings) {
    console.warn(`${tag} WARNING: ${warning}`);
  }

  if (config.errors.length > 0) {
    for (const error of config.errors) {
      console.error(`${tag} ERROR: ${error}`);
    }
    if (config.required) {
      throw new Error(
        `Windows signing is required (WINDOWS_SIGNING_ENABLED=true) but the configuration is invalid. ` +
          `Fix the ${config.errors.length} error(s) above.`
      );
    }
    console.warn(`${tag} Signing configuration is invalid — falling back to an UNSIGNED build.`);
    return false;
  }

  if (!config.enabled) {
    if (config.required) {
      throw new Error(`Windows signing is required but unavailable: ${config.reason}`);
    }
    console.warn(`${tag} ${config.reason}`);
    console.warn(`${tag} Artifacts will be UNSIGNED. Windows SmartScreen will warn end users.`);
    return false;
  }

  console.log(`${tag} ${config.reason}`);
  console.log(`${tag} Mode: ${config.mode} · required: ${config.required ? "yes" : "no (auto)"}`);
  console.log(
    config.signAllBinaries
      ? `${tag} Bundled native binaries (${EXTRA_SIGN_EXTS.join(", ")}) WILL be signed — ~11 signings this build.`
      : `${tag} Bundled native binaries skipped — ~5 signings this build. ` +
        `Set WINDOWS_SIGN_ALL_BINARIES=true to include them (~11).`
  );
  return true;
}

/**
 * Run a PowerShell snippet that prints JSON, and parse the result as an array.
 *
 * Two details matter and are easy to get wrong:
 *
 *  1. $ProgressPreference must be silenced. PowerShell writes progress records
 *     to stderr, and when stderr is a pipe it serialises them as CLIXML — which
 *     otherwise appears as a wall of XML in build logs.
 *
 *  2. stderr is captured rather than inherited. execFileSync forwards a child's
 *     stderr to the parent by default, so anything PowerShell writes there would
 *     land in our output even though we only read stdout.
 *
 * The snippet is passed as base64 -EncodedCommand, so quoting and escaping in
 * the script body can never be mangled by the shell.
 *
 * @param {string} script PowerShell source that emits JSON on stdout
 * @returns {any[]} parsed rows, or [] if PowerShell is unavailable/failed
 */
function runPowerShellJson(script) {
  const prelude = "$ProgressPreference = 'SilentlyContinue'\n";
  const encoded = Buffer.from(prelude + script, "utf16le").toString("base64");
  const stdout = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const text = (stdout || "").trim();
  if (text === "") return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

module.exports = {
  DEFAULT_TIMESTAMP_SERVER,
  EXTRA_SIGN_EXTS,
  normaliseThumbprint,
  resolveSigningConfig,
  reportSigningConfig,
  runPowerShellJson,
};
