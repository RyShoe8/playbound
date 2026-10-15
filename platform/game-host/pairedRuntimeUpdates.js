import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { httpsGetStream } from "./downloadStream.js";

export const PAIRED_RUNTIMES = Object.freeze(JSON.parse(fs.readFileSync(new URL("./pairedRuntimeProfiles.json", import.meta.url), "utf8")));
const cache = new Map();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safeRelative = (name) => name && !name.startsWith("/") && !name.includes("\\") && name.split("/").every(part => part && part !== "." && part !== "..");

/** Fingerprint every owned file; never include mutable worlds in the swap. */
export function verifyPairedTree(root, key, { profile = PAIRED_RUNTIMES[key] } = {}) {
  if (!profile || fs.realpathSync(root) !== path.resolve(root) || !fs.lstatSync(root).isDirectory()) throw new Error("Paired runtime requires a real package directory");
  const rows = [], stack = [root]; let count = 0;
  while (stack.length) {
    const parent = stack.pop();
    for (const name of fs.readdirSync(parent)) {
      const filename = path.join(parent, name), info = fs.lstatSync(filename), relative = path.relative(root, filename).split(path.sep).join("/");
      if (++count > 60_000 || !safeRelative(relative) || info.isSymbolicLink()) throw new Error("Paired runtime contains an unsafe path or too many entries");
      if (info.isDirectory()) { stack.push(filename); continue; }
      if (!info.isFile() || info.nlink !== 1 || (process.platform === "linux" && info.mode & 0o7022)) throw new Error("Paired runtime contains a special or writable package file");
      if (key === "bombsquad" && relative.split("/").includes("__pycache__") && name.endsWith(".pyc")) continue;
      rows.push({ filename, relative, info });
    }
  }
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.relative), Buffer.from(b.relative)));
  const fingerprint = rows.map(({ relative, info }) => [relative,info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs,info.mode].join(":")).join("|");
  let tree = cache.get(root);
  if (!tree || tree.fingerprint !== fingerprint) {
    const hash = createHash("sha256"); let totalBytes = 0;
    for (const row of rows) { hash.update(row.relative + "\0" + sha(fs.readFileSync(row.filename)) + "\n"); totalBytes += row.info.size; }
    tree = { fingerprint, treeSha256: hash.digest("hex"), fileCount: rows.length, totalBytes };
    if (cache.size >= 16) cache.clear(); cache.set(root, tree);
  }
  const release = profile.versions.find(version => version.treeSha256 === tree.treeSha256 && version.fileCount === tree.fileCount && version.totalBytes === tree.totalBytes);
  if (!release) throw new Error("Paired runtime engine and assets do not match a reviewed package");
  for (const binary of profile.binaries) {
    if (!safeRelative(binary)) throw new Error("Paired runtime binary path is invalid");
    const filename = path.join(root, binary);fs.accessSync(filename, fs.constants.X_OK);
    const fd = fs.openSync(filename, "r"), header = Buffer.alloc(20);
    try {
      if (fs.readSync(fd, header, 0, 20, 0) !== 20 || header.readUInt32BE(0) !== 0x7f454c46 || header[4] !== 2 || header[5] !== 1 || header.readUInt16LE(18) !== 62) throw new Error("Paired runtime needs a reviewed amd64 ELF engine");
    } finally { fs.closeSync(fd); }
  }
  return { buildId: release.buildId };
}

export function verifyPairedInstallation(root, key, options) {
  if (fs.realpathSync(root) !== path.resolve(root)) throw new Error("Paired runtime installation is not a real directory");
  if (key === "bombsquad" && path.basename(root) === key) {
    const wrapper = path.join(root,"run-server"), info = fs.lstatSync(wrapper);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || sha(fs.readFileSync(wrapper)) !== PAIRED_RUNTIMES[key].launcherSha256) throw new Error("Paired runtime BombSquad launcher requires compatibility review");
  }
  return verifyPairedTree(path.join(root, "runtime"), key, options);
}

/** One-time enrollment copies immutable legacy files; it never moves worlds. */
export function enrollPairedRuntime(root, key, { profile = PAIRED_RUNTIMES[key] } = {}) {
  if (!PAIRED_RUNTIMES[key] || !profile || fs.realpathSync(root) !== path.resolve(root)) throw new Error("Paired runtime enrollment requires a supported real installation");
  if (fs.existsSync(path.join(root, "runtime"))) return verifyPairedInstallation(root, key, { profile });
  const lock = path.join(root, ".pb-runtime-enroll.lock"), fd = fs.openSync(lock, "wx", 0o600);
  const fresh = path.join(root, ".pb-runtime-" + randomUUID());
  try {
    fs.mkdirSync(fresh, { mode: 0o700 });
    for (const name of key === "bombsquad" ? ["bombsquad_server", "dist"] : ["veloren-server-cli", "assets"]) {
      const original = path.join(root, name);
      if (fs.lstatSync(original).isSymbolicLink()) throw new Error("Paired runtime legacy files require review");
      fs.cpSync(original, path.join(fresh, name), { recursive: true, dereference: false, filter: file => !path.relative(root,file).split(path.sep).includes("__pycache__") });
    }
    const pending = [fresh];
    while (pending.length) {
      const folder = pending.pop();
      for (const name of fs.readdirSync(folder)) {
        const file = path.join(folder,name), info = fs.lstatSync(file);
        if (info.isSymbolicLink()) throw new Error("Paired runtime legacy links require review");
        if (info.isDirectory()) { fs.chmodSync(file,0o755);pending.push(file); }
        else if (info.isFile()) fs.chmodSync(file,info.mode & 0o755);
        else throw new Error("Paired runtime legacy special files require review");
      }
    }
    const result = verifyPairedTree(fresh, key, { profile });
    if (fs.existsSync(path.join(root, "runtime"))) throw new Error("Paired runtime was enrolled concurrently");
    fs.renameSync(fresh, path.join(root, "runtime"));
    return result;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

const HOSTS = new Set(["files.ballistica.net", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);
function trusted(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password) throw new Error("Paired runtime redirect is untrusted");
  return url.href;
}
export async function stagePairedRuntime(stage, key, { run, request = httpsGetStream, diskCheck = () => {}, profile = PAIRED_RUNTIMES[key], verify = verifyPairedInstallation } = {}) {
  if (!profile || !new RegExp(`^\\.pb-update-${key}-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$`).test(path.basename(stage))) throw new Error("Paired runtime requires an isolated staging directory");
  verify(stage, key);
  const release = profile.versions.find(row => row.buildId === profile.latest);
  if (!release || release.baselineOnly || !release.url) throw new Error("Paired runtime has no reviewed downloadable release");
  const archive = path.join(stage, ".paired-download"), fresh = path.join(stage, ".paired-fresh"), previous = path.join(stage, ".paired-previous");
  let response;
  try {
    let url = release.url; const signal = AbortSignal.timeout(20 * 60_000);
    for (let redirect = 0; redirect <= 4; redirect++) {
      response = await request(trusted(url), { signal, followRedirects: false, headers: { "User-Agent": "PlayBound-game-host" } });
      if (![301,302,303,307,308].includes(response.statusCode)) break;
      const next = response.headers?.location;response.stream?.destroy();
      if (!next || redirect === 4) throw new Error("Paired runtime redirect limit exceeded");
      url = trusted(new URL(next, url).href);
    }
    if (response.statusCode !== 200 || !response.stream) throw new Error("Paired runtime official download failed");
    const fd = fs.openSync(archive, "wx", 0o600), hash = createHash("sha256"); let size = 0;
    try {
      for await (const chunk of response.stream) {
        size += chunk.length;if (size > release.archiveBytes) throw new Error("Paired runtime archive exceeds reviewed size");
        diskCheck();hash.update(chunk);
        let offset = 0;while (offset < chunk.length) { const written = fs.writeSync(fd, chunk, offset, chunk.length - offset);if (!written) throw new Error("Paired runtime download write failed");offset += written; }
      }
      if (size !== release.archiveBytes || hash.digest("hex") !== release.archiveSha256) throw new Error("Paired runtime archive checksum mismatch");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    await run("/usr/bin/python3", [fileURLToPath(new URL("./pairedRuntimeArchive.py", import.meta.url)), key, archive, fresh], { timeout: 300_000, maxOutput: 4096 });
    if (verifyPairedTree(fresh, key, { profile }).buildId !== profile.latest) throw new Error("Paired runtime extracted the wrong release");
    if (fs.existsSync(previous)) throw new Error("Paired runtime staging requires inspection");
    fs.renameSync(path.join(stage, "runtime"), previous);
    fs.renameSync(fresh, path.join(stage, "runtime"));
    fs.rmSync(previous, { recursive: true });
    return verify(stage, key);
  } finally {
    response?.stream?.destroy();
    if (fs.existsSync(archive)) fs.unlinkSync(archive);
    if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true });
  }
}
