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

/**
 * The report the pad will actually receive, as a comparable key.
 *
 * Mirrors the host's own conversion: axes are rounded to int16, triggers to a
 * byte, and the Y axes are inverted. Comparing after that quantization rather
 * than on the raw floats is the whole point — a phone streams input on a fixed
 * 60Hz timer whether or not anything moved, and small analog noise below one
 * int16 step produces a byte-identical report. Both cases are frames the pad
 * cannot tell apart.
 *
 * Must agree exactly with the conversion in PlayBound.VigemHost.ps1, or a
 * frame the pad would have rendered differently could be skipped here. The
 * host writes its rounding as Floor(x + 0.5) for that reason — PowerShell's
 * [Math]::Round breaks exact .5 ties toward even, where Math.round always
 * rounds up. See the note in the host script. The two ship together and
 * windowsVigem.test.js checks them against each other.
 */
function toShort(v) {
  const n = Number(v);
  const c = Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0));
  return Math.floor(c * 32767 + 0.5);
}

function toByte(v) {
  const n = Number(v);
  const c = Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  return Math.floor(c * 255 + 0.5);
}

function reportKey(s) {
  return [
    Number(s.buttons) >>> 0,
    toShort(s.lx),
    toShort(-1 * Number(s.ly || 0)),
    toShort(s.rx),
    toShort(-1 * Number(s.ry || 0)),
    toByte(s.lt),
    toByte(s.rt),
  ].join("|");
}

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
  /**
   * Last report written per slot, so an unchanged frame costs nothing.
   *
   * Measured on the shipped PowerShell host, one update costs ~1.7ms — about
   * half of that PowerShell's own function-call and property-access overhead
   * rather than talking to the driver. Four pads streaming 60Hz is ~41% of a
   * core, and the host is a single serial loop, so frames it does not need to
   * process are the cheapest ones to remove. Cleared whenever a pad is created,
   * removed, or the host exits, because in each case what the pad holds is no
   * longer known here.
   * @type {Map<number, string>}
   */
  const lastReport = new Map();
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
      // A restarted host starts with no pads, so nothing may be deduped
      // against what the previous one was holding.
      lastReport.clear();
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
      // A freshly connected pad holds nothing we can compare against.
      lastReport.delete(slot);
      return {
        slot,
        remove() {
          slots.delete(slot);
          lastReport.delete(slot);
          void send({ cmd: "remove", slot }, true);
        },
        applyState(state) {
          const s = state || emptyPadState(slot);
          const key = reportKey(s);
          // Identical after quantization: submitting it again would leave the
          // pad in exactly the state it is already in.
          if (lastReport.get(slot) === key) return;
          lastReport.set(slot, key);
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
      lastReport.clear();
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

module.exports = {
  createWindowsVigemProvider,
  resolveVigemDir,
  // Exported for windowsVigem.test.js, which checks these agree with the
  // host script's own conversion at the clamp and rounding boundaries.
  toShort,
  toByte,
  reportKey,
};
