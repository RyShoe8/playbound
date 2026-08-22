/**
 * Windows ViGEm provider via bundled PowerShell host + Nefarius.ViGEm.Client.dll.
 * No node-gyp / no .NET SDK required to package or run.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { emptyPadState } = require("./protocol");

const HOST_PS1 = "PlayBound.VigemHost.ps1";

function resolveVigemDir() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "vigem"));
  }
  candidates.push(path.join(__dirname, "..", "..", "resources", "vigem"));
  try {
    const { app } = require("electron");
    if (app && !app.isPackaged) {
      candidates.push(path.join(app.getAppPath(), "resources", "vigem"));
    }
  } catch {
    /* ignore */
  }
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, HOST_PS1))) return dir;
  }
  return null;
}

function createWindowsVigemProvider() {
  let child = null;
  let buf = "";
  /** @type {Map<number, true>} */
  const slots = new Map();
  /** @type {Array<(msg: object) => void>} */
  let waiters = [];

  function ensureProcess() {
    if (child && !child.killed) return;
    const dir = resolveVigemDir();
    if (!dir) {
      throw new Error(
        "Controller host missing from this PlayBound build. Reinstall PlayBound."
      );
    }
    const script = path.join(dir, HOST_PS1);
    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      {
        cwd: dir,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }
    );
    buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        // update commands do not reply; only drain waiters for expecting cmds
        if (waiters.length) {
          const waiter = waiters.shift();
          waiter(msg);
        }
      }
    });
    child.stderr.on("data", () => {});
    child.on("exit", () => {
      child = null;
      slots.clear();
      const pending = waiters.splice(0);
      for (const w of pending) {
        w({ ok: false, error: "Controller host exited." });
      }
    });
  }

  function send(obj, expectReply) {
    ensureProcess();
    const line = JSON.stringify(obj) + "\n";
    if (!expectReply) {
      child.stdin.write(line);
      return Promise.resolve({ ok: true });
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ ok: false, error: "Controller host timed out." });
      }, 10000);
      waiters.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      try {
        child.stdin.write(line);
      } catch (err) {
        clearTimeout(timer);
        resolve({ ok: false, error: err.message || String(err) });
      }
    });
  }

  async function probe() {
    try {
      const res = await send({ cmd: "probe" }, true);
      if (res && res.ok) return { ok: true };
      return {
        ok: false,
        reason: (res && res.error) || "Controllers not enabled yet.",
      };
    } catch (err) {
      return {
        ok: false,
        reason: (err && err.message) || "Controllers not available.",
      };
    }
  }

  return {
    id: "windows-vigem-ps",
    probe,
    async createController(slot) {
      const res = await send({ cmd: "create", slot }, true);
      if (!res || !res.ok) {
        throw new Error(
          (res && res.error) ||
            "Failed to create virtual controller. Try Start Couch Mode again."
        );
      }
      slots.set(slot, true);
      return {
        slot,
        remove() {
          slots.delete(slot);
          void send({ cmd: "remove", slot }, true);
        },
        applyState(state) {
          const s = state || emptyPadState(slot);
          void send(
            {
              cmd: "update",
              slot,
              buttons: Number(s.buttons) >>> 0,
              lx: Number(s.lx) || 0,
              ly: Number(s.ly) || 0,
              rx: Number(s.rx) || 0,
              ry: Number(s.ry) || 0,
              lt: Number(s.lt) || 0,
              rt: Number(s.rt) || 0,
            },
            false
          );
        },
      };
    },
    dispose() {
      for (const slot of [...slots.keys()]) {
        void send({ cmd: "remove", slot }, false);
      }
      slots.clear();
      try {
        void send({ cmd: "quit" }, false);
      } catch {
        /* ignore */
      }
      try {
        child?.kill();
      } catch {
        /* ignore */
      }
      child = null;
    },
  };
}

module.exports = { createWindowsVigemProvider, resolveVigemDir };
