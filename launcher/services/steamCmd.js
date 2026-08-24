const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const STEAMCMD_WINDOWS_URL =
  "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

function runSteamCmd(binary, args, { spawnImpl = spawn, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let lastUpdate = 0;
    const capture = (chunk) => {
      const text = String(chunk || "");
      output = (output + text).slice(-12000);
      const now = Date.now();
      if (now - lastUpdate > 500 && /Update state|progress|download/i.test(text)) {
        lastUpdate = now;
        onProgress?.({ phase: "downloading", addon: "Downloading game files…" });
      }
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.on("error", (err) => reject(new Error(`SteamCMD failed to start: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`SteamCMD exited with code ${code}: ${output.trim().slice(-1200)}`));
    });
  });
}

/**
 * PlayBound-managed SteamCMD. This is intentionally anonymous-only: it can
 * install public depots without the Steam desktop client or a Steam account,
 * but it must never prompt for or store a player's Steam credentials.
 */
function createSteamCmdInstaller({
  userDataPath,
  tempPath,
  downloadTo,
  extractArchive,
  spawnImpl,
  platform = process.platform,
  onProgress,
}) {
  const root = path.join(userDataPath, "runtimes", "steamcmd");
  const binary = path.join(root, "steamcmd.exe");
  let ensurePromise = null;

  async function ensureInstalled() {
    if (platform !== "win32") {
      throw new Error("Anonymous SteamCMD installs are currently supported on Windows only.");
    }
    if (fs.existsSync(binary)) return binary;
    if (ensurePromise) return ensurePromise;

    ensurePromise = (async () => {
      onProgress?.({ phase: "downloading", addon: "Installing the PlayBound download helper…" });
      await fsp.mkdir(root, { recursive: true });
      const archive = path.join(tempPath, "playbound-launcher", "steamcmd.zip");
      await downloadTo(STEAMCMD_WINDOWS_URL, archive);
      await extractArchive(archive, root);
      await fsp.rm(archive, { force: true }).catch(() => {});
      if (!fs.existsSync(binary)) {
        throw new Error("SteamCMD downloaded, but steamcmd.exe was not found after extraction.");
      }
      return binary;
    })().finally(() => {
      ensurePromise = null;
    });
    return ensurePromise;
  }

  async function install({ appId, installDir, title }) {
    const normalizedAppId = String(appId || "").trim();
    if (!/^\d+$/.test(normalizedAppId)) {
      throw new Error("Anonymous SteamCMD install is missing a numeric app ID.");
    }
    const steamcmd = await ensureInstalled();
    await fsp.mkdir(installDir, { recursive: true });
    onProgress?.({
      phase: "downloading",
      addon: `Installing ${title || "game"} without the Steam client…`,
    });
    await runSteamCmd(
      steamcmd,
      [
        "+@ShutdownOnFailedCommand",
        "1",
        "+@NoPromptForPassword",
        "1",
        "+force_install_dir",
        installDir,
        "+login",
        "anonymous",
        "+app_update",
        normalizedAppId,
        "validate",
        "+quit",
      ],
      { spawnImpl, onProgress }
    );
    return { version: `steamcmd-${normalizedAppId}`, dir: installDir };
  }

  return { ensureInstalled, install };
}

module.exports = {
  STEAMCMD_WINDOWS_URL,
  createSteamCmdInstaller,
  runSteamCmd,
};
