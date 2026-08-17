/**
 * Virtual LAN — the launcher half of PlayBound Connect's overlay mode.
 *
 * Some games only find their friends over LAN broadcast and offer no address
 * to connect to, so there is nothing for the launcher to pass on the command
 * line. Instead the party shares one L2 overlay segment and the game's own
 * discovery does the work. ZeroTier provides the segment because it is the
 * overlay that actually carries broadcast; routed VPNs do not.
 *
 * What this module does, in order:
 *   1. find the ZeroTier CLI
 *   2. read this machine's node ID (the site authorizes it onto the network)
 *   3. join the network
 *   4. resolve the Windows adapter name ZeroTier created
 *   5. write that name into the game's saved-adapter file
 *
 * Step 5 is what turns a fiddly in-game dropdown into one click on "use saved
 * network adapter".
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { execFile } = require("child_process");

const EXEC_TIMEOUT_MS = 15_000;

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

/**
 * Candidate CLI locations. ZeroTier ships `zerotier-cli.bat` on Windows and a
 * plain binary elsewhere; if it is on PATH the bare name wins.
 */
function cliCandidates() {
  if (process.platform === "win32") {
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    return [
      path.join(pf86, "ZeroTier", "One", "zerotier-cli.bat"),
      path.join(pf, "ZeroTier", "One", "zerotier-cli.bat"),
      "zerotier-cli",
    ];
  }
  if (process.platform === "darwin") {
    return ["/usr/local/bin/zerotier-cli", "/usr/sbin/zerotier-cli", "zerotier-cli"];
  }
  return ["/usr/sbin/zerotier-cli", "/usr/bin/zerotier-cli", "zerotier-cli"];
}

function findCli() {
  for (const candidate of cliCandidates()) {
    // A bare name has no path to test; leave it for execFile and PATH.
    if (!candidate.includes(path.sep)) return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const DOWNLOAD_URL = "https://www.zerotier.com/download/";

/**
 * Present tense state of the overlay client on this machine. `needsElevation`
 * is its own case rather than a generic failure because it is the common one:
 * the CLI reads a secret only an administrator can open, so a perfectly
 * installed ZeroTier still refuses to answer an unelevated launcher.
 */
async function overlayStatus() {
  const cli = findCli();
  if (!cli) {
    return { installed: false, ready: false, nodeId: null, downloadUrl: DOWNLOAD_URL };
  }

  const info = await run(cli, ["info"]);
  if (!info.ok) {
    const blob = `${info.stdout}${info.stderr}`.toLowerCase();
    const needsElevation =
      blob.includes("authtoken") || blob.includes("permission") || blob.includes("denied");
    return {
      installed: true,
      ready: false,
      nodeId: null,
      needsElevation,
      error: needsElevation
        ? "ZeroTier needs administrator access. Run PlayBound as administrator once to let it manage the network."
        : info.error || "ZeroTier is installed but not responding.",
      downloadUrl: DOWNLOAD_URL,
    };
  }

  // "200 info <nodeId> <version> ONLINE"
  const match = info.stdout.match(/\b200 info ([0-9a-f]{10})\b/i);
  return {
    installed: true,
    ready: Boolean(match),
    nodeId: match ? match[1].toLowerCase() : null,
    online: /ONLINE/i.test(info.stdout),
    downloadUrl: DOWNLOAD_URL,
  };
}

async function joinNetwork(networkId) {
  const cli = findCli();
  if (!cli) return { error: "ZeroTier is not installed" };
  if (!/^[0-9a-f]{16}$/i.test(String(networkId || ""))) {
    return { error: "Invalid network id" };
  }
  const res = await run(cli, ["join", String(networkId).toLowerCase()]);
  if (!res.ok) return { error: res.error || "Could not join the network" };
  return { ok: true };
}

async function leaveNetwork(networkId) {
  const cli = findCli();
  if (!cli || !/^[0-9a-f]{16}$/i.test(String(networkId || ""))) return;
  await run(cli, ["leave", String(networkId).toLowerCase()]);
}

/**
 * The adapter's *friendly* name — what the game shows in its dropdown and
 * what its saved-adapter file expects. ZeroTier's own CLI reports the device
 * GUID instead, so this has to come from the OS.
 */
async function resolveAdapterName() {
  if (process.platform !== "win32") return null;
  const res = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "(Get-NetAdapter | Where-Object { $_.InterfaceDescription -like 'ZeroTier*' } | Select-Object -First 1).Name",
  ]);
  if (!res.ok) return null;
  const name = res.stdout.trim();
  return name || null;
}

/**
 * Wait for the adapter to come up. A join returns immediately but the
 * interface only appears once the controller authorizes this node, so the
 * caller would otherwise write an empty adapter name.
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
  resolveAdapterName,
  waitForAdapter,
  writeAdapterFile,
};
