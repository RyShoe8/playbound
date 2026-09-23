/**
 * PlayBound Remote — Moonlight wrapper (client decode/input).
 *
 * Same vendoring/spawn pattern as `sunshineHost.js` and `couch/windowsVigem.js`.
 * Spawned via `moonlight-qt`'s CLI in direct-stream mode so its own GUI and
 * pairing screens never render — the player only ever sees PlayBound's own
 * "Connecting to Ryan's Gaming PC…" screen, then the stream itself.
 *
 * NOT WIRED TO A REAL BINARY YET — same caveat as sunshineHost.js. The exact
 * CLI flags below (`stream`, `--resolution`, `--fps`, `--windowed`) are
 * written from general knowledge of moonlight-qt's documented CLI, not
 * verified against a pinned version's actual `--help` output — confirm
 * before relying on them.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const CLIENT_EXE = "moonlight.exe";

function resolveMoonlightDir() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "moonlight"));
  }
  candidates.push(path.join(__dirname, "..", "..", "resources", "moonlight"));
  try {
    const { app } = require("electron");
    if (app && !app.isPackaged) {
      candidates.push(path.join(app.getAppPath(), "resources", "moonlight"));
    }
  } catch {
    /* ignore — not running under Electron (e.g. a unit test) */
  }
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, CLIENT_EXE))) return dir;
  }
  return null;
}

/**
 * @param {{ host: string, appName: string, resolution?: string, fps?: number, displayMode?: string }} opts
 * @returns {string[]} argv for spawning moonlight.exe directly into a stream,
 *   bypassing its own app-picker/settings UI.
 */
function buildStreamArgs({
  host,
  appName,
  resolution = "1920x1080",
  fps = 60,
  displayMode = "windowed",
}) {
  const validModes = new Set(["windowed", "fullscreen", "borderless"]);
  const mode = validModes.has(displayMode) ? displayMode : "windowed";
  return [
    "--resolution",
    resolution,
    "--fps",
    String(fps),
    "--display-mode",
    mode,
    "--quit-after",
    "stream",
    host,
    appName,
  ];
}

/**
 * @param {object} deps
 * @param {typeof spawn} [deps.spawnFn] injected for testability
 * @param {() => string | null} [deps.resolveDir] injected for testability
 */
function createMoonlightClient(deps = {}) {
  const spawnFn = deps.spawnFn || spawn;
  const resolveDir = deps.resolveDir || resolveMoonlightDir;

  let child = null;

  function isStreaming() {
    return Boolean(child && !child.killed);
  }

  /**
   * @param {{ host: string, appName: string, resolution?: string, fps?: number, onExit?: () => void }} opts
   */
  function startStream(opts) {
    if (isStreaming()) return { ok: false, reason: "A stream is already running." };
    const dir = resolveDir();
    if (!dir) {
      return {
        ok: false,
        reason: "Remote Play needs to be repaired.",
        repair: true,
      };
    }
    const args = buildStreamArgs(opts);
    child = spawnFn(path.join(dir, CLIENT_EXE), args, {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false, // the stream window itself must be visible — this only hides a console, if any
    });
    child.on("exit", () => {
      child = null;
      opts.onExit?.();
    });
    return { ok: true };
  }

  /**
   * Checks if Moonlight has already completed pairing with the given host.
   * `moonlight.exe list <host>` connects to the host headless and exits 0 if paired,
   * or non-zero (or error) if not paired.
   *
   * @param {{ host: string, timeoutMs?: number }} opts
   * @returns {Promise<boolean>}
   */
  function isHostPaired({ host, timeoutMs = 4000 }) {
    const dir = resolveDir();
    if (!dir) return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      let p = null;

      const done = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      };

      const timer = setTimeout(() => {
        try {
          p?.kill();
        } catch {}
        done(false);
      }, timeoutMs);

      try {
        p = spawnFn(path.join(dir, CLIENT_EXE), ["list", host], {
          cwd: dir,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });

        p.on("exit", (code) => {
          done(code === 0);
        });
        p.on("error", () => {
          done(false);
        });
      } catch {
        done(false);
      }
    });
  }

  /**
   * Pairs Moonlight with the target host using the given PIN.
   * Spawns `moonlight.exe pair <host> --pin <pin>`.
   * While running, monitors `isHostPaired` and process output.
   * Once pairing is verified or process exits, terminates the pair window and resolves.
   *
   * @param {{ host: string, pin: string, timeoutMs?: number }} opts
   * @returns {Promise<{ ok: boolean, reason?: string, repair?: boolean }>}
   */
  function pairHost({ host, pin, timeoutMs = 30000 }) {
    const dir = resolveDir();
    if (!dir) {
      return Promise.resolve({
        ok: false,
        reason: "Remote Play needs to be repaired.",
        repair: true,
      });
    }

    return new Promise((resolve) => {
      let settled = false;
      let checkTimer = null;
      let pairChild = null;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        if (checkTimer) clearInterval(checkTimer);
        try {
          pairChild?.kill();
        } catch {}
        resolve(result);
      };

      const timeoutTimer = setTimeout(() => {
        finish({ ok: false, reason: "Pairing with host PC timed out." });
      }, timeoutMs);

      try {
        pairChild = spawnFn(path.join(dir, CLIENT_EXE), ["pair", host, "--pin", pin], {
          cwd: dir,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
      } catch (err) {
        return finish({ ok: false, reason: err?.message || "Failed to launch pairing process." });
      }

      let output = "";
      pairChild.stdout?.on("data", (d) => (output += d.toString()));
      pairChild.stderr?.on("data", (d) => (output += d.toString()));

      pairChild.on("exit", (code) => {
        if (code === 0 || output.includes("already paired")) {
          finish({ ok: true });
        } else {
          finish({ ok: false, reason: output.trim() || "Pairing failed." });
        }
      });

      pairChild.on("error", (err) => {
        finish({ ok: false, reason: err?.message || "Failed to run pairing process." });
      });

      // Poll isHostPaired every 600ms while pair is running.
      // As soon as pairing completes in the background, Moonlight saves the host.
      // Checking isHostPaired will return true, allowing us to terminate the pairChild dialog and finish!
      checkTimer = setInterval(async () => {
        if (settled) return;
        try {
          const paired = await isHostPaired({ host, timeoutMs: 1500 });
          if (paired) {
            finish({ ok: true });
          }
        } catch {}
      }, 600);
    });
  }

  function stopStream() {
    if (!child) return;
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    child = null;
  }

  return { startStream, stopStream, isStreaming, isHostPaired, pairHost, resolveMoonlightDir: resolveDir };
}

module.exports = { CLIENT_EXE, resolveMoonlightDir, buildStreamArgs, createMoonlightClient };
