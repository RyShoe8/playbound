"use strict";

/*
 * Moved out of main.js unchanged: helpers that touch no main-process state
 * (no windows, sessions or timers). main.js requires what it needs from here.
 */

const fs = require("fs");
const path = require("path");
const { createLocalServers } = require("../localServer");
const { launcherJson, probeServerLatency } = require("./core");

/* ── local dedicated servers ───────────────────────────────── */

/**
 * The dedicated server binary inside a game's install, if it ships one.
 *
 * `hostLaunch.binaryHint` names it — OpenRA.Server, teeworlds_srv, bzfs — and
 * that is emphatically not the game's own executable. Starting the client with
 * server arguments is what shipped in 0.3.26: OpenRA's client came up, nothing
 * bound the port, selfHostReady was never set, and every other member's Join
 * Game silently did nothing.
 *
 * Returning null is a real answer, and the caller falls back to the path that
 * worked before: launch the game, let the player host from its menus, probe
 * the port. Plenty of games ship no separate server.
 */
function resolveLocalServerBinary(gameDir, hostLaunch) {
  const hint = String(hostLaunch?.binaryHint || "").trim();
  if (!gameDir || !hint) return null;
  const names = [hint];
  if (process.platform === "win32" && !/\.(exe|bat|cmd|jar)$/i.test(hint)) {
    names.push(`${hint}.exe`);
  }
  if (/teeworlds|ddnet/i.test(hint) || /teeworlds|ddnet/i.test(gameDir)) {
    if (process.platform === "win32") {
      names.push("DDNet-Server.exe", "teeworlds_srv.exe");
    } else {
      names.push("DDNet-Server", "teeworlds_srv");
    }
  }
  // Shallow on purpose: a server binary sits beside the client or one level
  // down. Walking a whole install to find one is a lot of disk for a guess.
  const roots = [gameDir, path.join(gameDir, "bin")];
  try {
    const subs = fs.readdirSync(gameDir);
    for (const sub of subs) {
      if (names.includes(sub)) continue;
      const full = path.join(gameDir, sub);
      try {
        if (fs.statSync(full).isDirectory()) roots.push(full);
      } catch {}
    }
  } catch {}
  for (const root of roots) {
    for (const name of names) {
      try {
        const candidate = path.join(root, name);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch {
        /* unreadable path is a miss */
      }
    }
  }
  return null;
}


const localServers = createLocalServers({
  onExit: (partyId, code, error) => {
    console.warn(`[self-host] ${partyId}: server exited (${code})`);
    void reportSelfHostState(partyId, { ready: false, error });
  },
});

/**
 * Which parties this launcher is hosting a server for.
 *
 * Only the leader reconciles — every other member's launcher has nothing to
 * run — so this is empty on most machines and holds at most one entry on the
 * host's.
 */
const selfHostReconcilers = new Map();

/**
 * Wait for a spawned server to actually answer on its port.
 *
 * A process that started is not a server that is listening — the same reason
 * the menu-driven self-host path probed rather than trusting the click. Some
 * dedicated servers load maps for several seconds before they bind.
 */
async function waitForLocalListener(port, timeoutMs) {
  if (!port) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ms = await probeServerLatency("127.0.0.1", port, 750);
    if (Number.isFinite(ms)) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function reportSelfHostState(partyId, patch) {
  try {
    await launcherJson(`/api/parties/${encodeURIComponent(partyId)}/self-host-server`, {
      method: "POST",
      body: patch,
    });
  } catch (err) {
    console.warn(`[self-host] could not report state: ${err.message}`);
  }
}

module.exports = { resolveLocalServerBinary, localServers, selfHostReconcilers, waitForLocalListener, reportSelfHostState };
