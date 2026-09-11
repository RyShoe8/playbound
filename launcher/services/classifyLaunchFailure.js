/**
 * Map a spawn/play failure to a telemetry code.
 *
 * Prefer err.code from spawnTrackedExe. Do not treat every "exited immediately"
 * message as Java — native games (e.g. HoloCure.exe) correctly use EARLY_EXIT.
 */

/**
 * @param {{ code?: string, message?: string } | null | undefined} err
 * @param {string} launchPath
 * @returns {{ code: string, message: string }}
 */
function classifyLaunchFailure(err, launchPath) {
  const rawMessage = err?.message || String(err || "Unknown launch error");
  const isJar = /\.jar$/i.test(launchPath || "");
  let code = "UNKNOWN";
  let message = rawMessage;

  if (
    err?.code === "JAVA_MISSING" ||
    (/Java 17\+/i.test(rawMessage) && !/exited immediately/i.test(rawMessage))
  ) {
    code = "JAVA_MISSING";
  } else if (err?.code === "EARLY_EXIT") {
    code = "EARLY_EXIT";
  } else if (err?.code === "JAVA_EARLY_EXIT" || (isJar && /exited immediately/i.test(rawMessage))) {
    code = "JAVA_EARLY_EXIT";
    message = `The game exited immediately after launch (${pathBasename(launchPath || "game")}). Open Folder and try running it manually, check GPU drivers, or reinstall.`;
  } else if (/exited immediately/i.test(rawMessage)) {
    // Legacy errors without err.code — native vs jar from path.
    code = isJar ? "JAVA_EARLY_EXIT" : "EARLY_EXIT";
  }

  return { code, message };
}

function pathBasename(p) {
  const s = String(p || "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}

module.exports = { classifyLaunchFailure };
