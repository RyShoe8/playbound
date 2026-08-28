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

/**
 * Path to the bundled MSI inside the app's extraResources.
 *
 * electron-builder places extraResources under `process.resourcesPath`.
 * In development `resourcesPath` falls back to the source tree, so this
 * still resolves during `npm start`.
 */
function bundledMsiPath() {
  const base = process.resourcesPath || path.join(__dirname, "..");
  return path.join(base, "netbird", "netbird_installer.msi");
}

/**
 * Silently install the bundled NetBird MSI.
 *
 * Called automatically when `overlayStatus` finds no CLI. NSIS already runs
 * this during Setup, so it only fires for portable builds, users who
 * declined UAC at install time, or when NetBird was uninstalled.
 *
 * `msiexec /quiet` requires elevation, so this shells out through
 * PowerShell's `Start-Process -Verb RunAs` to trigger a single UAC prompt.
 * The user sees one dialog the first time they join a party; never again.
 */
async function autoInstallNetBird(onProgress) {
  const msi = bundledMsiPath();
  try {
    if (!fs.existsSync(msi)) {
      return { error: "Bundled NetBird installer not found.", needsInstall: true };
    }
  } catch {
    return { error: "Could not check for bundled NetBird installer.", needsInstall: true };
  }

  onProgress?.("Installing network client (approve the Windows prompt)…");

  // PowerShell Start-Process -Wait -Verb RunAs triggers a single UAC prompt,
  // runs msiexec quietly, and cleans up the NetBird desktop shortcut.
  const ps = [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Start-Process cmd -ArgumentList '/c','msiexec /i "${msi}" /quiet & del /f /q "%PUBLIC%\\Desktop\\NetBird*.lnk" "%USERPROFILE%\\Desktop\\NetBird*.lnk"' -Verb RunAs -Wait; exit $LASTEXITCODE`,
  ];
  const res = await run("powershell", ps);

  // Verify the CLI is now discoverable.
  const cli = findCli();
  if (cli) {
    onProgress?.("Starting network service…");
    // Wait briefly for the NetBird service to finish starting up.
    for (let attempt = 0; attempt < 10; attempt++) {
      const status = await run(cli, ["status"]);
      if (status.ok || !status.stderr.toLowerCase().includes("daemon")) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { ok: true };
  }

  // The MSI ran but the CLI still is not where we expect it. Either the user
  // declined UAC or the install failed silently.
  const hint = /canceled|cancelled|denied|elevation/i.test(`${res.stdout}${res.stderr}`)
    ? "Administrator access was declined."
    : "The installer ran but NetBird was not found afterwards.";
  return { error: hint, needsInstall: true };
}

const DOWNLOAD_URL = "https://pkgs.netbird.io/windows/x64";

/**
 * State of the overlay client on this machine.
 *
 * `needsElevation` is its own case rather than a generic failure because it is
 * the common one: the CLI talks to a privileged service, so a perfectly
 * installed NetBird still refuses an unelevated launcher.
 */
async function overlayStatus(onProgress) {
  let cli = findCli();

  // Auto-install from the bundled MSI if NetBird is not present.
  if (!cli) {
    const install = await autoInstallNetBird(onProgress);
    if (!install.ok) {
      return {
        installed: false,
        connected: false,
        error: install.error,
        needsInstall: true,
        downloadUrl: DOWNLOAD_URL,
      };
    }
    cli = findCli();
    if (!cli) {
      return { installed: false, connected: false, downloadUrl: DOWNLOAD_URL };
    }
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
async function joinNetwork({ managementUrl, setupKey }, onProgress) {
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

  onProgress?.("Connecting to party network…");

  // Retry up to 3 times in case the daemon was starting up.
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await run(cli, [
      "up",
      "--management-url",
      String(managementUrl),
      "--setup-key",
      String(setupKey),
    ]);
    if (res.ok) return { ok: true };
    lastError = res.error || "Could not join the party network";
    if (/ENOENT/i.test(lastError)) {
      return {
        error: "PlayBound Connect needs the NetBird network client for this game.",
        needsInstall: true,
      };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { error: lastError || "Could not join the party network" };
}

async function leaveNetwork() {
  const cli = findCli();
  if (!cli) return;
  await run(cli, ["down"]);
}

/**
 * The adapter's *friendly* name — what the game shows in its dropdown and what
 * its saved-adapter file expects. On Windows, NetBird creates a Wintun interface
 * named `wt0` (or `wt*`) with description `WireGuard Tunnel`.
 */
async function resolveAdapterName() {
  if (process.platform !== "win32") return null;
  const res = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "(Get-NetAdapter | Where-Object { $_.InterfaceDescription -like '*NetBird*' -or $_.Name -like '*netbird*' -or $_.InterfaceDescription -like '*WireGuard*' -or $_.Name -like 'wt*' } | Select-Object -First 1).Name",
  ]);
  if (!res.ok) return null;
  const name = res.stdout.trim();
  return name || null;
}

async function resolveAdapterAddress() {
  // First attempt: read the assigned NetBird IP directly from CLI status JSON.
  const cli = findCli();
  if (cli) {
    const statusRes = await run(cli, ["status", "--json"]);
    if (statusRes.ok) {
      try {
        const data = JSON.parse(statusRes.stdout);
        const rawIp = data?.netbirdIp;
        if (rawIp) {
          const ip = String(rawIp).split("/")[0].trim();
          if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;
        }
      } catch {
        /* fallback to OS query */
      }
    }
  }

  // Fallback: PowerShell query for wt* or NetBird adapter IPv4 address.
  if (process.platform !== "win32") return null;
  const res = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like '*netbird*' -or $_.InterfaceAlias -like 'wt*' } | Select-Object -First 1).IPAddress",
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
async function waitForAdapter(timeoutMs = 45_000, onProgress) {
  const deadline = Date.now() + timeoutMs;
  onProgress?.("Configuring virtual network adapter…");
  for (;;) {
    const name = await resolveAdapterName();
    if (name) return name;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/**
 * Wait for the virtual adapter to receive its overlay IP address.
 */
async function waitForAdapterAddress(timeoutMs = 45_000, onProgress) {
  const deadline = Date.now() + timeoutMs;
  onProgress?.("Acquiring network address…");
  for (;;) {
    const address = await resolveAdapterAddress();
    if (address) return address;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 1500));
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
  waitForAdapterAddress,
  writeAdapterFile,
};
