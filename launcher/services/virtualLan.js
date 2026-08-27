/**
 * Virtual LAN — the launcher half of PlayBound Connect's overlay mode.
 *
 * Some games only find their friends over LAN and offer no address to connect
 * to, so there is nothing for the launcher to pass on the command line.
 * Instead the party shares one NetBird segment, self-hosted on the PlayBound
 * VPS, and the game's own discovery works across it.
 *
 * What this module does, in order:
 *   1. find the NetBird CLI
 *   2. enrol against our management server with the party's setup key
 *   3. wait for the interface to come up
 *   4. resolve the adapter's friendly name
 *   5. write that name into the game's saved-adapter file
 *
 * Step 5 is what turns a fiddly in-game dropdown into one click on "use saved
 * network adapter".
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const dgram = require("dgram");
const { execFile } = require("child_process");

const EXEC_TIMEOUT_MS = 30_000;

function run(file, args) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: EXEC_TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          error: err ? err.message : null,
        });
      }
    );
  });
}

function cliCandidates() {
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || "";
    return [
      path.join(pf, "NetBird", "netbird.exe"),
      path.join(pf86, "NetBird", "netbird.exe"),
      local ? path.join(local, "Programs", "NetBird", "netbird.exe") : null,
    ].filter(Boolean);
  }
  if (process.platform === "darwin") {
    return ["/usr/local/bin/netbird", "/opt/homebrew/bin/netbird"];
  }
  return ["/usr/bin/netbird", "/usr/local/bin/netbird"];
}

/**
 * Absolute path to the NetBird CLI, or null.
 *
 * Never return a bare `netbird` name. That made overlayStatus report
 * "installed" and then execFile fail with `spawn netbird ENOENT` whenever the
 * Program Files install was missing and PATH had no netbird either.
 */
function findCli() {
  for (const candidate of cliCandidates()) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  try {
    const finder = process.platform === "win32" ? "where.exe" : "which";
    const out = require("child_process").execFileSync(finder, ["netbird"], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    });
    const first = String(out || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (first && fs.existsSync(first)) return first;
  } catch {
    /* not on PATH */
  }
  return null;
}

const DOWNLOAD_URL = "https://app.netbird.io/install";

/**
 * State of the overlay client on this machine.
 *
 * `needsElevation` is its own case rather than a generic failure because it is
 * the common one: the CLI talks to a privileged service, so a perfectly
 * installed NetBird still refuses an unelevated launcher.
 */
async function overlayStatus() {
  const cli = findCli();
  if (!cli) {
    return { installed: false, connected: false, downloadUrl: DOWNLOAD_URL };
  }

  const res = await run(cli, ["status"]);
  const blob = `${res.stdout}${res.stderr}`;
  if (!res.ok) {
    const lower = blob.toLowerCase();
    const needsElevation =
      lower.includes("permission") || lower.includes("denied") || lower.includes("administrator");
    return {
      installed: true,
      connected: false,
      needsElevation,
      error: needsElevation
        ? "NetBird needs administrator access. Run PlayBound as administrator once to let it manage the network."
        : res.error || "NetBird is installed but not responding.",
      downloadUrl: DOWNLOAD_URL,
    };
  }

  return {
    installed: true,
    connected: /Management:\s*Connected/i.test(blob) || /Daemon status:\s*Connected/i.test(blob),
    downloadUrl: DOWNLOAD_URL,
  };
}

/**
 * Enrol this machine on the party's segment.
 *
 * `netbird up` is idempotent — an already-connected peer re-registers against
 * the new key and picks up the party's group rather than erroring.
 */
async function joinNetwork({ managementUrl, setupKey }) {
  const cli = findCli();
  if (!cli) {
    return {
      error: "PlayBound Connect needs the NetBird network client for this game.",
      needsInstall: true,
    };
  }
  if (!managementUrl || !setupKey) return { error: "Missing network details" };
  // Our own management server only; never enrol against a URL we did not issue.
  if (!/^https:\/\/[\w.-]+(:\d+)?\/?$/.test(String(managementUrl))) {
    return { error: "Invalid management URL" };
  }

  const res = await run(cli, [
    "up",
    "--management-url",
    String(managementUrl),
    "--setup-key",
    String(setupKey),
  ]);
  if (!res.ok) {
    const msg = res.error || "Could not join the party network";
    if (/ENOENT/i.test(msg)) {
      return {
        error: "PlayBound Connect needs the NetBird network client for this game.",
        needsInstall: true,
      };
    }
    return { error: msg };
  }
  return { ok: true };
}

async function leaveNetwork() {
  const cli = findCli();
  if (!cli) return;
  await run(cli, ["down"]);
}

/**
 * The adapter's *friendly* name — what the game shows in its dropdown and what
 * its saved-adapter file expects. The CLI reports interface details, not the
 * Windows friendly name, so this has to come from the OS.
 */
async function resolveAdapterName() {
  if (process.platform !== "win32") return null;
  const res = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "(Get-NetAdapter | Where-Object { $_.InterfaceDescription -like '*NetBird*' -or $_.Name -like '*netbird*' } | Select-Object -First 1).Name",
  ]);
  if (!res.ok) return null;
  const name = res.stdout.trim();
  return name || null;
}

async function resolveAdapterAddress() {
  if (process.platform !== "win32") return null;
  const res = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like '*netbird*' } | Select-Object -First 1).IPAddress",
  ]);
  if (!res.ok) return null;
  const address = res.stdout.trim();
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) ? address : null;
}

let discoverySocket = null;
let discoveryTimer = null;

function stopDiscoveryBridge() {
  if (discoveryTimer) clearInterval(discoveryTimer);
  discoveryTimer = null;
  if (discoverySocket) discoverySocket.close();
  discoverySocket = null;
}

/**
 * HoloCure's mod discovers hosts with UDP broadcast, which WireGuard/NetBird
 * intentionally does not carry. The party leader therefore sends the mod's
 * normal `From2` discovery reply directly to each overlay peer. The packet's
 * source remains the leader's NetBird address, so the unmodified client then
 * opens its normal TCP connection to port 27016.
 */
async function startDiscoveryBridge({ localAddress, getPeerAddresses }) {
  stopDiscoveryBridge();
  if (!localAddress || typeof getPeerAddresses !== "function") return false;

  const socket = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, localAddress, () => {
      socket.removeListener("error", reject);
      resolve();
    });
  });
  discoverySocket = socket;

  const announce = async () => {
    let peers = [];
    try {
      peers = await getPeerAddresses();
    } catch {
      return;
    }
    const payload = Buffer.from("From2", "utf8");
    for (const address of new Set(peers || [])) {
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(address))) {
        socket.send(payload, 27015, String(address));
      }
    }
  };
  await announce();
  discoveryTimer = setInterval(announce, 1500);
  discoveryTimer.unref?.();
  return true;
}

/**
 * Wait for the adapter to come up. `up` returns before the interface is
 * registered, so the caller would otherwise write an empty adapter name.
 */
async function waitForAdapter(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const name = await resolveAdapterName();
    if (name) return name;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Point the game at the overlay adapter.
 *
 * `adapterFile` comes from the game's multiplayer adapter (for HoloCure,
 * `MultiplayerMod/lastUsedNetworkAdapter`). Refuses to write outside the game
 * folder — the path arrives from the server with everything else.
 */
async function writeAdapterFile(gameDir, adapterFile, adapterName) {
  if (!gameDir || !adapterFile || !adapterName) return false;
  const target = path.resolve(gameDir, adapterFile);
  const root = path.resolve(gameDir);
  if (target !== root && !target.startsWith(root + path.sep)) return false;

  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, adapterName, "utf8");
  return true;
}

module.exports = {
  DOWNLOAD_URL,
  findCli,
  joinNetwork,
  leaveNetwork,
  overlayStatus,
  resolveAdapterAddress,
  resolveAdapterName,
  startDiscoveryBridge,
  stopDiscoveryBridge,
  waitForAdapter,
  writeAdapterFile,
};
