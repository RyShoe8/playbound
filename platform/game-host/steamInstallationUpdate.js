import fs from "node:fs";
import path from "node:path";

const LOG_LIMIT = 256 * 1024;
const MANIFEST_LIMIT = 1024 * 1024;

function checkpoint(filename) {
  try {
    const stat = fs.statSync(filename);
    return stat.isFile() ? { size: stat.size, ino: stat.ino, dev: stat.dev } : null;
  } catch { return null; }
}

// Only inspect bytes produced by this command, never yesterday's Steam errors.
function appendedLog(filename, before) {
  if (!before) return "";
  let fd;
  try {
    fd = fs.openSync(filename, "r");
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.ino !== before.ino || stat.dev !== before.dev || stat.size <= before.size) return "";
    const start = Math.max(before.size, stat.size - LOG_LIMIT);
    const buffer = Buffer.alloc(stat.size - start);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.subarray(0, bytes).toString("utf8");
  } catch { return ""; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function readStagedManifest(stage, appId) {
  const root = path.resolve(stage);
  if (!/^\.pb-update-[a-z0-9-]+-[a-f0-9-]{36}$/.test(path.basename(root)) || fs.realpathSync(root) !== root) throw new Error("SteamCMD recovery requires an isolated staging directory");
  const directory = path.join(root, "steamapps");
  if (fs.realpathSync(directory) !== directory) throw new Error("SteamCMD staging metadata must remain inside the installation");
  const filename = path.join(directory, `appmanifest_${appId}.acf`);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MANIFEST_LIMIT) throw new Error("SteamCMD staging manifest requires inspection");
  const contents = fs.readFileSync(filename, "utf8");
  if (contents.match(/"appid"\s*"(\d+)"/i)?.[1] !== String(appId)) throw new Error("SteamCMD staging manifest has the wrong app ID");
  return { filename, manifests: new Set([...contents.matchAll(/"manifest"\s*"(\d+)"/gi)].map(match => match[1])) };
}

function diagnostics(text, appId, installedManifests) {
  const relevant = text.split(/\r?\n/).filter(line => new RegExp(`(?:AppID ${appId}\\b|App: ${appId},)`).test(line));
  const denied = relevant.filter(line => /access denied/i.test(line));
  const onlyOldManifestsDenied = denied.length > 0 && denied.every(line => {
    const manifest = line.match(/Manifest: (\d+),/i)?.[1];
    return Boolean(manifest && installedManifests.has(manifest));
  });
  // Never return raw logs, which can contain session URLs and credentials.
  const message = denied.length ? "SteamCMD depot manifest access was denied by Steam; the current installation was preserved"
    : relevant.some(line => /disk write|not enough disk|insufficient disk/i.test(line)) ? "SteamCMD could not write the staged download; the current installation was preserved"
      : relevant.some(line => /no connection|failed to connect|connection timeout/i.test(line)) ? "SteamCMD could not connect to Steam; the current installation was preserved" : null;
  return { onlyOldManifestsDenied, message };
}

/** Retry a retired installed-manifest reference once, only in the disposable copy. */
export async function updateSteamInstallation({ stage, appId, branch, gamesRoot, hostHome }, { run, onRecovery = () => {} }) {
  if (!Number.isSafeInteger(appId) || appId <= 0 || (branch && !/^[a-zA-Z0-9_-]{1,64}$/.test(branch))) throw new Error("SteamCMD update target requires inspection");
  const manifest = readStagedManifest(stage, appId);
  const log = hostHome ? path.join(hostHome, "Steam/logs/content_log.txt") : "";
  const args = ["+force_install_dir", stage, "+login", "anonymous", "+app_update", String(appId), ...(branch && branch !== "public" ? ["-beta", branch] : [])];
  async function attempt(validate) {
    const before = checkpoint(log);
    try {
      const output = await run("/usr/games/steamcmd", [...args, ...(validate ? ["validate"] : []), "+quit"], { root: gamesRoot });
      if (!output.includes(`Success! App '${appId}' fully installed.`) && !output.includes(`Success! App '${appId}' already up to date.`)) throw new Error("SteamCMD did not confirm a complete installation");
      return null;
    } catch (error) {
      const detail = diagnostics(appendedLog(log, before), appId, manifest.manifests);
      // A safety stop always takes precedence over any earlier depot error.
      if (/disk|timed out|Update stopped|Cannot verify/i.test(error.message || "")) throw error;
      return { error, ...detail };
    }
  }
  const failure = await attempt(false);
  if (!failure) return;
  if (!failure.onlyOldManifestsDenied) throw failure.message ? new Error(failure.message) : failure.error;
  readStagedManifest(stage, appId); // Recheck the boundary after Steam touched it.
  const saved = path.join(stage, `.pb-retired-appmanifest-${appId}.acf`);
  if (fs.existsSync(saved)) throw new Error("SteamCMD metadata recovery was already attempted; operator inspection required");
  fs.renameSync(manifest.filename, saved);
  onRecovery();
  const retry = await attempt(true);
  if (retry) throw new Error(retry.message || "SteamCMD metadata recovery failed; the current installation was preserved");
  fs.unlinkSync(saved);
}
