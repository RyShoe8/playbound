import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { httpsGetStream } from "./downloadStream.js";
import { PAIRED_RUNTIMES, verifyPairedInstallation } from "./pairedRuntimeUpdates.js";

export const OPEN_FORTRESS_RELEASE = Object.freeze({
  appId: 244310, branch: "previous2021", sdkBuild: "6982827",
  url: "https://beans.adastral.net/open_fortress.7z",
  etag: '"66dabda9-9c01910f"', archiveBytes: 2617348367,
  archiveSha256: "4ac3451e099e8057af5e5ebe765c3b90fb5e6afdaeedaeb9d7a0ea47eb609b1e",
});

const VERIFICATION_FILE = ".pb-openfortress-verified.json";

/** Called only after a worker/operator completed full package verification. */
export function recordOpenFortressVerification(root, verified, { profile = PAIRED_RUNTIMES["open-fortress"] } = {}) {
  if (fs.realpathSync(root) !== path.resolve(root)) throw new Error("Open Fortress verification root requires review");
  const release = profile.versions.find(row => row.buildId === verified.buildId);
  if (!release) throw new Error("Open Fortress verification release is unknown");
  const runtime = path.join(root, "runtime"), info = fs.statSync(runtime);
  if (fs.realpathSync(runtime) !== path.resolve(runtime) || !info.isDirectory()) throw new Error("Open Fortress verification runtime requires review");
  const temporary = path.join(root, ".verification-" + randomUUID());
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, buildId: release.buildId, treeSha256: release.treeSha256, device: info.dev, inode: info.ino }), { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, path.join(root, VERIFICATION_FILE));
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

/** Inventory/queue metadata only. Workers and recipe preparation still hash all assets. */
export function inspectOpenFortressInstallation(root, { profile = PAIRED_RUNTIMES["open-fortress"] } = {}) {
  const runtime = path.join(root, "runtime"), marker = path.join(root, VERIFICATION_FILE);
  if (fs.realpathSync(root) !== path.resolve(root) || fs.realpathSync(runtime) !== path.resolve(runtime)) throw new Error("Open Fortress installation requires review");
  const info = fs.lstatSync(marker);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 4096) throw new Error("Open Fortress full verification record is unavailable");
  const recorded = JSON.parse(fs.readFileSync(marker, "utf8")), folder = fs.statSync(runtime);
  const release = profile.versions.find(row => row.buildId === recorded.buildId && row.treeSha256 === recorded.treeSha256);
  if (recorded.version !== 1 || !release || recorded.device !== folder.dev || recorded.inode !== folder.ino) throw new Error("Open Fortress installation changed and needs full verification");
  for (const name of ["srcds_linux", "open_fortress/bin/server.so", "bin/steamclient.so", "open_fortress/maps/dm_2fort.bsp", "sdk-build.json"]) {
    const file = path.join(runtime, name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || fs.realpathSync(file) !== path.resolve(file)) throw new Error("Open Fortress critical runtime file requires review");
  }
  const launcher = path.join(runtime, "srcds_linux");
  if (fs.statSync(launcher).size > 1024 * 1024 || shaFile(launcher) !== release.launcherSha256) throw new Error("Open Fortress launcher differs from its verification record");
  return { buildId: release.buildId };
}

/** A deliberate update after rollback can reuse the retained reviewed pair. */
export function retainedOpenFortressPackage(store, gamesRoot, { inspect = inspectOpenFortressInstallation, latest = PAIRED_RUNTIMES["open-fortress"].latest } = {}) {
  for (const job of store.all()) {
    if (job.key !== "open-fortress" || job.action !== "rollback" || job.status !== "completed" || job.packageReusedBy || job.beforeBuild !== latest || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(job.id)) continue;
    const root = path.join(gamesRoot, `.pb-rollback-open-fortress-${job.id}`);
    try { if (inspect(root).buildId === latest) return { job, root }; }
    catch { /* An absent or changed retained package is never reused. */ }
  }
  return null;
}

export async function openFortressModVersion(request = fetch) {
  const response = await request(OPEN_FORTRESS_RELEASE.url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(30_000) });
  const etag = response.headers.get("etag"), size = response.headers.get("content-length");
  if (!response.ok || !/^"[a-f0-9]{1,32}-[a-f0-9]{1,32}"$/.test(etag || "") || !/^[1-9]\d{0,10}$/.test(size || "")) throw new Error("Open Fortress publisher release metadata is unavailable");
  return { etag, bytes: Number(size) };
}

function shaFile(file) {
  const fd = fs.openSync(file, "r"), hash = createHash("sha256"), buffer = Buffer.alloc(512 * 1024);
  try {
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length));
    return hash.digest("hex");
  } finally { fs.closeSync(fd); }
}

export function openFortressArchivePath(gamesRoot) {
  return path.join(gamesRoot, ".pb-artifact-cache", `openfortress-${OPEN_FORTRESS_RELEASE.archiveSha256}.7z`);
}

export async function openFortressArchive(gamesRoot, { request = httpsGetStream, diskCheck = () => {} } = {}) {
  if (fs.realpathSync(gamesRoot) !== path.resolve(gamesRoot)) throw new Error("Open Fortress installation root requires review");
  const file = openFortressArchivePath(gamesRoot), root = path.dirname(file), release = OPEN_FORTRESS_RELEASE;
  fs.mkdirSync(root, { mode: 0o700, recursive: true });
  if (fs.realpathSync(root) !== path.resolve(root) || !fs.lstatSync(root).isDirectory()) throw new Error("Open Fortress archive cache requires review");
  try {
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== release.archiveBytes || shaFile(file) !== release.archiveSha256) throw new Error("Open Fortress cached archive differs from review");
    return file;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = path.join(root, ".download-" + randomUUID());
  let response;
  try {
    diskCheck(release.archiveBytes);
    response = await request(release.url, { followRedirects: false, signal: AbortSignal.timeout(20 * 60_000), headers: { "User-Agent": "PlayBound-game-host" } });
    if (response.statusCode !== 200 || !response.stream) throw new Error("Open Fortress publisher download failed");
    const fd = fs.openSync(temporary, "wx", 0o600), hash = createHash("sha256"); let bytes = 0;
    try {
      for await (const chunk of response.stream) {
        bytes += chunk.length;
        if (bytes > release.archiveBytes) throw new Error("Open Fortress publisher archive exceeds review size");
        diskCheck(); hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) {
          const written = fs.writeSync(fd, chunk, offset, chunk.length - offset);
          if (!written) throw new Error("Open Fortress archive write failed");
          offset += written;
        }
      }
      if (bytes !== release.archiveBytes || hash.digest("hex") !== release.archiveSha256) throw new Error("Open Fortress publisher archive checksum differs from review");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.chmodSync(temporary, 0o444); fs.renameSync(temporary, file);
    return file;
  } finally {
    response?.stream?.destroy();
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export async function stageOpenFortress(stage, { run, request = fetch, archiveRequest = httpsGetStream, diskCheck = () => {}, verify = verifyPairedInstallation, resolveArchive = openFortressArchive } = {}) {
  if (!/^\.pb-update-open-fortress-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(path.basename(stage)) || fs.realpathSync(stage) !== path.resolve(stage)) throw new Error("Open Fortress requires an isolated staging directory");
  const metadata = await openFortressModVersion(request), release = OPEN_FORTRESS_RELEASE;
  if (metadata.etag !== release.etag || metadata.bytes !== release.archiveBytes) throw new Error("Open Fortress mod release changed and requires compatibility review");
  const sdk = path.join(stage, "source-sdk"), home = path.join(stage, "steam-home");
  for (const folder of ["runtime", "source-sdk", "steam-home"]) {
    try { fs.lstatSync(path.join(stage, folder)); throw new Error("Open Fortress staging already contains files requiring inspection"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const archive = await resolveArchive(path.dirname(stage), { request: archiveRequest, diskCheck });
  fs.mkdirSync(sdk, { mode: 0o700 }); fs.mkdirSync(home, { mode: 0o700 });
  const sdkArgs = ["-i", "PATH=/usr/local/bin:/usr/bin:/bin:/usr/games", "LANG=C.UTF-8", `HOME=${home}`, `XDG_DATA_HOME=${path.join(home, ".local/share")}`,
    "/usr/games/steamcmd", "+@sSteamCmdForcePlatformType", "linux", "+force_install_dir", sdk, "+login", "anonymous", "+app_update", String(release.appId), "-beta", release.branch, "validate", "+quit"];
  for (let attempt = 0; ; attempt++) {
    try { await run("/usr/bin/env", sdkArgs, { root: path.dirname(stage), timeout: 10 * 60_000, maxOutput: 32_768 }); break; }
    catch (error) {
      // A fresh SteamCMD bootstrap can fail before its first SDK install.
      // Retry once in the same isolated download; never retry denial/disk/timeout.
      if (attempt || !/^SteamCMD (?:download failed|could not connect)/.test(error.message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  const manifest = path.join(sdk, "steamapps/appmanifest_244310.acf");
  const info = fs.lstatSync(manifest);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 65536) throw new Error("Open Fortress SDK manifest requires review");
  const text = fs.readFileSync(manifest, "utf8");
  for (const [key, expected] of [["appid", String(release.appId)], ["buildid", release.sdkBuild], ["BetaKey", release.branch], ["StateFlags", "4"]]) {
    const values = [...text.matchAll(new RegExp(`"${key}"\\s+"([^"]*)"`, "gi"))].map(match => match[1]);
    if (!values.length || values.some(value => value !== expected)) throw new Error("Open Fortress SDK build/channel changed and requires compatibility review");
  }
  await run("/usr/bin/python3", [fileURLToPath(new URL("./openFortressPackage.py", import.meta.url)), sdk, archive, path.join(stage, "runtime")], { root: path.dirname(stage), timeout: 13 * 60_000, maxOutput: 4096 });
  const installed = verify(stage, "open-fortress");
  if (installed.buildId !== PAIRED_RUNTIMES["open-fortress"].latest) throw new Error("Open Fortress rebuilt package differs from the reviewed SDK/mod pair");
  fs.rmSync(sdk, { recursive: true }); fs.rmSync(home, { recursive: true });
  return installed;
}
