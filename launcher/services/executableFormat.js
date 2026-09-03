/**
 * Windows executable-format sniffing.
 *
 * The Elder Scrolls: Arena is a DOS game, and Bethesda's freeware package
 * carries `Arena106.exe` — the original 16-bit self-extracting installer —
 * alongside the modern files. `findExecutable` broke ties by file size, and
 * the DOS blob is the biggest .exe in the folder, so Play pointed at it.
 * `CreateProcess` refused the image and telemetry recorded
 * `spawn C:\Games\tes-arena\Arena106.exe EACCES`, with no hint of why.
 *
 * A Windows image can be identified without running it. Every one starts with
 * an "MZ" DOS header whose `e_lfanew` field (offset 0x3C) points at the real
 * header: "PE\0\0" for anything 64-bit Windows can execute, "NE"/"LE"/"LX"
 * for 16-bit Windows and DOS-extender binaries, and nothing at all for a plain
 * DOS program. Everything that is not PE needs DOSBox or an equivalent, so the
 * launcher must never pick one as a native launch target.
 */

const fs = require("fs");

/** MZ header size — `e_lfanew` lives at 0x3C, so 64 bytes always covers it. */
const DOS_HEADER_BYTES = 64;
const E_LFANEW_OFFSET = 0x3c;

/**
 * @typedef {"pe" | "legacy" | "not-windows" | "unreadable"} ExecutableFormat
 * - `pe`          — a modern PE image; Windows can execute it.
 * - `legacy`      — MZ without PE: DOS, 16-bit NE, or an LE/LX extender.
 * - `not-windows` — readable, but not an MZ image at all (script, ELF, Mach-O).
 * - `unreadable`  — missing, locked, or too short to classify.
 */

/**
 * Classify a file by its executable headers. Never executes anything.
 * @param {string} filePath
 * @returns {ExecutableFormat}
 */
function executableFormat(filePath) {
  if (!filePath) return "unreadable";
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const dosHeader = Buffer.alloc(DOS_HEADER_BYTES);
    const dosRead = fs.readSync(fd, dosHeader, 0, DOS_HEADER_BYTES, 0);
    if (dosRead < 2) return "unreadable";
    if (dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) return "not-windows"; // "MZ"
    if (dosRead < E_LFANEW_OFFSET + 4) return "legacy";

    const peOffset = dosHeader.readUInt32LE(E_LFANEW_OFFSET);
    // A real DOS stub points past itself and inside the file. Zero, or an
    // offset past the end, means there is no second header to find.
    const size = fs.fstatSync(fd).size;
    if (peOffset < DOS_HEADER_BYTES || peOffset + 4 > size) return "legacy";

    const signature = Buffer.alloc(4);
    const sigRead = fs.readSync(fd, signature, 0, 4, peOffset);
    if (sigRead < 4) return "legacy";
    // "PE\0\0". NE / LE / LX land here too and stay `legacy` — 64-bit Windows
    // dropped the 16-bit subsystem those need.
    if (signature.toString("latin1") === "PE\0\0") return "pe";
    return "legacy";
  } catch {
    return "unreadable";
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * True only when the file is definitely a DOS-era image. Anything unreadable
 * or non-Windows answers false: refusing to launch is a worse failure than
 * letting a spawn we could not classify try its luck.
 * @param {string} filePath
 * @returns {boolean}
 */
function isLegacyDosExecutable(filePath) {
  return executableFormat(filePath) === "legacy";
}

/**
 * True when Play should spawn through the shared DOSBox runtime.
 * A Windows PE is never wrapped — OpenTESArena's otesa.exe stays native.
 * `needsDosBox` only applies when headers are unsure, not when they say PE.
 * @param {string} filePath
 * @param {{ needsDosBox?: boolean }} [options]
 * @returns {boolean}
 */
function shouldLaunchThroughDosBox(filePath, { needsDosBox = false } = {}) {
  if (!filePath || !/\.(exe|com)$/i.test(filePath)) return false;
  const fmt = executableFormat(filePath);
  if (fmt === "pe") return false;
  if (fmt === "legacy") return true;
  return Boolean(needsDosBox);
}

/**
 * First path, in the caller's preference order, that Windows can actually
 * execute.
 *
 * Preference ranking alone chose wrong for TES: Arena — Bethesda's 16-bit
 * `Arena106.exe` and the modern build are both plain .exe files, and the
 * size tie-break favours the DOS blob. Only headers separate them. A file
 * that is not a Windows image at all (a .jar, a macOS bundle, a Linux
 * binary) is taken at its ranked position; the check applies to .exe/.com
 * alone. When every candidate is DOS-era, the top one comes back anyway so
 * the caller can wrap it in DOSBox instead of "no executable found".
 * @param {string[]} orderedPaths - Best first.
 * @param {{ platform?: NodeJS.Platform }} [options] - Platform override for tests.
 * @returns {string | null}
 */
function preferRunnableExecutable(orderedPaths, { platform = process.platform } = {}) {
  const list = (orderedPaths || []).filter(Boolean);
  if (list.length === 0) return null;
  if (platform !== "win32") return list[0];
  for (const candidate of list) {
    if (!/\.(exe|com)$/i.test(candidate)) return candidate;
    if (!isLegacyDosExecutable(candidate)) return candidate;
  }
  return list[0];
}

/**
 * Whether this OS could run the file at all.
 *
 * Several packages ship every platform's build in one archive — Xonotic's zip
 * carries the Windows .exe, the Linux ELF and the macOS .app side by side — and
 * a per-game list of candidate names walked past the Windows entries into
 * `xonotic-linux64-sdl`, which Windows cannot execute. Worse, the pick was
 * written back into the install record, so the game stayed broken until
 * someone located the exe by hand.
 *
 * Decided by name and header, never by running anything. On Windows a launch
 * target has to be a PE image or a script Windows knows how to run; anywhere
 * else a Windows executable is not a candidate.
 *
 * @param {string} filePath
 * @param {{ platform?: string }} [opts]
 * @returns {boolean}
 */
function runnableOnPlatform(filePath, { platform = process.platform } = {}) {
  const p = String(filePath || "");
  if (!p) return false;
  if (platform === "win32") {
    if (/\.(bat|cmd|jar)$/i.test(p)) return true;
    if (!/\.(exe|com)$/i.test(p)) return false;
    // A DOS-era image is a separate problem with its own path (DOSBox); this
    // only answers whether Windows could load it directly.
    return !isLegacyDosExecutable(p);
  }
  // A .exe on Linux or macOS needs a compatibility layer the launcher does not
  // silently assume. Everything else — ELF, Mach-O, .app, a shell script — is
  // left to the caller, which already knows what it went looking for.
  return !/\.(exe|com|bat|cmd)$/i.test(p);
}

/**
 * The first candidate this OS can actually run.
 *
 * A convenience over runnableOnPlatform for the per-game name lists, which are
 * ordered by preference and where "the first one that exists" was the rule
 * that let a Linux binary win on Windows.
 *
 * @param {(string|null|undefined)[]} orderedPaths
 * @param {{ platform?: string }} [opts]
 * @returns {string | null}
 */
function firstRunnableOnPlatform(orderedPaths, opts = {}) {
  for (const candidate of orderedPaths || []) {
    if (candidate && runnableOnPlatform(candidate, opts)) return candidate;
  }
  return null;
}

/**
 * Player-facing explanation for a DOS-era launch target when DOSBox is missing.
 * @param {string} exeName
 * @returns {string}
 */
function dosExecutableMessage(exeName) {
  const name = exeName || "This program";
  return (
    `${name} is a DOS-era (16-bit) program, which 64-bit Windows cannot run directly. ` +
    `PlayBound runs it through DOSBox — try Play again, or use Locate to pick the modern ` +
    `game executable if this install has one.`
  );
}

module.exports = {
  executableFormat,
  isLegacyDosExecutable,
  shouldLaunchThroughDosBox,
  preferRunnableExecutable,
  runnableOnPlatform,
  firstRunnableOnPlatform,
  dosExecutableMessage,
};
