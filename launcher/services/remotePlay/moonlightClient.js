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
 * @param {{ host: string, appName: string, resolution?: string, fps?: number }} opts
 * @returns {string[]} argv for spawning moonlight.exe directly into a stream,
 *   bypassing its own app-picker/settings UI.
 */
function buildStreamArgs({ host, appName, resolution = "1920x1080", fps = 60 }) {
  // TODO(verify): confirm this exact subcommand/flag surface against the
  // pinned moonlight-qt release's own `moonlight --help` before relying on
  // it — CLI syntax has changed between moonlight-qt releases before.
  return ["stream", host, appName, "--resolution", resolution, "--fps", String(fps), "--windowed"];
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

  function stopStream() {
    if (!child) return;
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    child = null;
  }

  return { startStream, stopStream, isStreaming, resolveMoonlightDir: resolveDir };
}

module.exports = { CLIENT_EXE, resolveMoonlightDir, buildStreamArgs, createMoonlightClient };
