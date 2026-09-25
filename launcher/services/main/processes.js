"use strict";

/*
 * Moved out of main.js unchanged: helpers that touch no main-process state
 * (no windows, sessions or timers). main.js requires what it needs from here.
 */

const { app } = require("electron");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const saveLocations = require("../saveLocations");
const { DEFAULT_EDITION_SLUG, ensureGameInstallRecord, loadState, normalizeProcessImageName, saveData } = require("./core");

/**
 * Back up a game's saves once it closes.
 *
 * Deliberately local-only and shipped ahead of any cloud transport: the thing
 * that actually loses people's progress is a game corrupting its own save or a
 * player overwriting the wrong slot, and a local versioned history fixes that
 * without a server, an account, or a network round trip.
 *
 * Exiting is the right moment — the files have just been written and are not
 * being held open. Failures are logged and swallowed; a backup must never be
 * able to interfere with having just finished playing.
 */
function saveContextFor(slug) {
  const state = loadState();
  const game = ensureGameInstallRecord(state[slug]);
  const edition =
    game?.editions && game.editionSlug ? game.editions[game.editionSlug] : null;
  const installDir =
    (edition && edition.dir) ||
    game?.dir ||
    (game?.exe ? path.dirname(game.exe) : null) ||
    null;
  return {
    userData: app.getPath("userData"),
    installDir: installDir && fs.existsSync(installDir) ? installDir : installDir,
  };
}

async function snapshotSavesAfterPlay(slug) {
  try {
    if (!saveLocations.supportsCloudSaves(slug)) return;
    const saveDir = saveLocations.saveDirFor(slug, saveContextFor(slug));
    if (!saveDir || !fs.existsSync(saveDir)) return;

    const state = loadState();
    const game = ensureGameInstallRecord(state[slug]);
    const editionSlug = game.editionSlug || DEFAULT_EDITION_SLUG;

    const policy = saveLocations.policyFor(slug);
    const result = await saveData.snapshot(slug, editionSlug, saveDir, {
      only: policy.only,
      reason: "after-play",
      maxSnapshotMb: policy.maxSnapshotMb,
    });

    if (result.status === "too-large") {
      // Sandbox worlds outgrow this legitimately. Say so once rather than
      // silently doing nothing, so a player is never under the impression
      // their saves are protected when they are not.
      console.warn(
        `[saves] ${slug}: saves are ${(result.bytes / 1048576).toFixed(0)}MB, over the ` +
          `${policy.maxSnapshotMb}MB limit — skipping backup.`
      );
      return;
    }
    if (result.status !== "captured") return;

    await saveData.prune(slug, editionSlug, policy.keep);
    console.log(`[saves] ${slug}: captured ${result.files} file(s) as ${result.id}`);
  } catch (err) {
    console.warn(`[saves] snapshot after play failed for ${slug}:`, err?.message || err);
  }
}

/** Extract simple process names from catalog exeHint (skip regex fragments). */
function hintProcessNames(exeHint) {
  if (!exeHint) return [];
  const out = [];
  for (const part of String(exeHint).split("|")) {
    const token = part.trim();
    if (/^[A-Za-z0-9_-]+$/.test(token)) {
      out.push(normalizeProcessImageName(token));
    }
  }
  return out;
}

/**
 * Is any of these process images running, and do we actually know?
 *
 * The distinction matters. This used to collapse "the probe failed" into "the
 * process is gone": tasklist timing out under load, or pgrep failing to spawn,
 * landed in the same `catch` as a genuine no-match and returned false. The
 * exit poll below runs every 10 seconds for the entire session, so one
 * transient hiccup — most likely exactly when the machine is busy — ended a
 * session while the game was still running. A 54-minute RollerCoaster Tycoon
 * session was reported "Finished" that way with the game still open, which
 * also means playtime and playing-now counts were quietly under-reported.
 *
 * @returns {{ running: boolean, certain: boolean }} `certain` is false when a
 *   probe errored, meaning `running: false` is "we could not tell", not "no".
 */
function probeImagesRunning(imageNames) {
  const names = (imageNames || []).filter(Boolean);
  if (!names.length) return { running: false, certain: true };

  let probeFailed = false;

  if (process.platform === "win32") {
    for (const image of names) {
      try {
        const out = execFileSync(
          "tasklist",
          ["/FI", `IMAGENAME eq ${image}`, "/NH"],
          { encoding: "utf8", windowsHide: true, timeout: 5000 }
        );
        if (out.toLowerCase().includes(image.toLowerCase())) {
          return { running: true, certain: true };
        }
      } catch {
        // tasklist prints "INFO: No tasks..." and still exits 0 on a clean
        // miss, so reaching here means the probe itself failed.
        probeFailed = true;
      }
    }
    return { running: false, certain: !probeFailed };
  }

  for (const image of names) {
    const procName = image.replace(/\.exe$/i, "");
    try {
      execFileSync("pgrep", ["-x", procName], {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return { running: true, certain: true };
    } catch (err) {
      // pgrep exits 1 for "no process matched" — a definitive answer. Any
      // other status (spawn failure, timeout, pgrep missing) is not.
      if (err?.status !== 1) probeFailed = true;
    }
  }
  return { running: false, certain: !probeFailed };
}

/**
 * Boolean view for callers deciding whether a game is alive.
 *
 * An uncertain probe reports "running" on purpose: every caller uses this to
 * decide whether to tear a session down or report a launch failure, and doing
 * either on a guess is worse than waiting for the next poll to give a real
 * answer.
 */
function isAnyImageRunning(imageNames) {
  const { running, certain } = probeImagesRunning(imageNames);
  return running || !certain;
}

/** Best-effort taskkill for recorded / hinted game image names (Windows). */
function killGameImageNames(imageNames) {
  if (process.platform !== "win32") return;
  for (const image of [...new Set((imageNames || []).filter(Boolean))]) {
    try {
      execFileSync("taskkill", ["/F", "/IM", image], {
        windowsHide: true,
        timeout: 5000,
        stdio: "ignore",
      });
    } catch {
      /* not running */
    }
  }
}

/**
 * Kill any Windows process whose executable lives under one of the install dirs.
 * Covers Godot/OpenCiv3 cases where Task Manager shows a different display name
 * but the binary is still under playbound/games/<slug>.
 */
function killProcessesUnderDirs(dirs) {
  if (process.platform !== "win32") return;
  const roots = [...new Set((dirs || []).filter(Boolean).map((d) => path.resolve(d)))]
    .filter((d) => fs.existsSync(d))
    .map((d) => d.replace(/\//g, "\\").replace(/\\+$/, ""));
  if (!roots.length) return;

  const rootsLiteral = roots.map((r) => r.replace(/'/g, "''")).join("','");
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$roots = @('${rootsLiteral}')
Get-CimInstance Win32_Process | ForEach-Object {
  $exe = [string]$_.ExecutablePath
  if (-not $exe) { return }
  $norm = $exe.Replace('/', '\\')
  foreach ($root in $roots) {
    if ($norm.StartsWith($root + '\\', [StringComparison]::OrdinalIgnoreCase) -or
        $norm.Equals($root, [StringComparison]::OrdinalIgnoreCase)) {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      break
    }
  }
}
`;
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      windowsHide: true,
      timeout: 15000,
      stdio: "ignore",
    });
  } catch {
    /* best-effort */
  }
}

module.exports = { saveContextFor, snapshotSavesAfterPlay, hintProcessNames, probeImagesRunning, isAnyImageRunning, killGameImageNames, killProcessesUnderDirs };
