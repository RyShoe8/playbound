/**
 * Map a spawn/play failure to a telemetry code.
 *
 * Prefer err.code from spawnTrackedExe. Do not treat every "exited immediately"
 * message as Java — native games (e.g. HoloCure.exe) correctly use EARLY_EXIT.
 *
 * OpenMW-family engines abort with no window when Morrowind data is missing;
 * that is MORROWIND_DATA_MISSING, not GPU/driver EARLY_EXIT noise.
 */

"use strict";

const OPENMW_FAMILY_SLUGS = new Set(["morrowind", "openmw", "tes3mp"]);

/**
 * @param {string | null | undefined} text
 */
function looksLikeMissingMorrowindData(text) {
  return /No content file given|content file given|Missing master|Morrowind\.esm|no game file|Aborting\.\.\./i.test(
    String(text || "")
  );
}

/**
 * @param {{ code?: string, message?: string, stderrTail?: string, exitCode?: number | null, signal?: string | null } | null | undefined} err
 * @param {string} launchPath
 * @param {{
 *   morrowindDataFound?: boolean | null,
 *   editionSlug?: string | null,
 *   gameSlug?: string | null,
 * } | null | undefined} [opts]
 * @returns {{
 *   code: string,
 *   message: string,
 *   exitCode?: number | null,
 *   signal?: string | null,
 *   stderrTail?: string,
 *   exeBasename?: string,
 * }}
 */
function classifyLaunchFailure(err, launchPath, opts = {}) {
  const rawMessage = err?.message || String(err || "Unknown launch error");
  const stderrTail = String(err?.stderrTail || "").slice(0, 2048);
  const isJar = /\.jar$/i.test(launchPath || "");
  const exeBasename = pathBasename(launchPath || err?.exeBasename || "game");
  let code = "UNKNOWN";
  let message = rawMessage;

  const editionSlug = String(opts?.editionSlug || "").toLowerCase();
  const gameSlug = String(opts?.gameSlug || "").toLowerCase();
  const openMwFamily =
    OPENMW_FAMILY_SLUGS.has(gameSlug) ||
    OPENMW_FAMILY_SLUGS.has(editionSlug) ||
    /openmw|tes3mp/i.test(exeBasename);

  const earlyExit =
    err?.code === "EARLY_EXIT" ||
    err?.code === "JAVA_EARLY_EXIT" ||
    /exited immediately/i.test(rawMessage);

  const missingDataHint =
    opts?.morrowindDataFound === false ||
    looksLikeMissingMorrowindData(rawMessage) ||
    looksLikeMissingMorrowindData(stderrTail);

  const isSteamGame =
    Boolean(opts?.steamAppId) ||
    Boolean(opts?.isSteam) ||
    /steamapps[\\/]common/i.test(String(launchPath || ""));
  const exitCodeZero = err?.exitCode === 0;

  if (openMwFamily && earlyExit && missingDataHint) {
    code = "MORROWIND_DATA_MISSING";
    message =
      "OpenMW/TES3MP needs Morrowind game data (Morrowind.esm). Install a legal GOTY copy via Steam/GOG, then try Play again so PlayBound can point the engine at it.";
  } else if (earlyExit && exitCodeZero && isSteamGame) {
    code = "STEAM_HANDOFF_TIMEOUT";
    message = `Steam took too long to start ${exeBasename}. Make sure the Steam client is running and logged in, then try again.`;
  } else if (
    err?.code === "JAVA_MISSING" ||
    (/Java 17\+/i.test(rawMessage) && !/exited immediately/i.test(rawMessage))
  ) {
    code = "JAVA_MISSING";
  } else if (
    err?.code === "GES_STEAM_MISSING" ||
    err?.code === "GES_SDK_MISSING" ||
    err?.code === "GES_MOD_MISSING"
  ) {
    code = err.code;
  } else if (err?.code === "EARLY_EXIT") {
    code = "EARLY_EXIT";
  } else if (err?.code === "JAVA_EARLY_EXIT" || (isJar && /exited immediately/i.test(rawMessage))) {
    code = "JAVA_EARLY_EXIT";
    message = `The game exited immediately after launch (${exeBasename}). Open Folder and try running it manually, check GPU drivers, or reinstall.`;
  } else if (/exited immediately/i.test(rawMessage)) {
    // Legacy errors without err.code — native vs jar from path.
    code = isJar ? "JAVA_EARLY_EXIT" : "EARLY_EXIT";
  }

  const out = { code, message, exeBasename };
  if (err?.exitCode != null) out.exitCode = err.exitCode;
  if (err?.signal) out.signal = err.signal;
  if (stderrTail) out.stderrTail = stderrTail;
  return out;
}

function pathBasename(p) {
  const s = String(p || "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}

module.exports = { classifyLaunchFailure, looksLikeMissingMorrowindData };
