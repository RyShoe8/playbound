import fs from "node:fs";
import path from "node:path";
import { verifySpaceStation14Metadata } from "./spaceStation14Runtime.js";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { httpsGetStream } from "./downloadStream.js";

export const PAIRED_RUNTIMES = Object.freeze(JSON.parse(fs.readFileSync(new URL("./pairedRuntimeProfiles.json", import.meta.url), "utf8")));
const cache = new Map();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fileSha(filename) {
  const hash = createHash("sha256"), buffer = Buffer.alloc(512 * 1024), fd = fs.openSync(filename, "r");
  try {
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length));
    return hash.digest("hex");
  } finally { fs.closeSync(fd); }
}
const safeRelative = (name) => name && !name.startsWith("/") && !name.includes("\\") && name.split("/").every(part => part && part !== "." && part !== "..");

/** Fingerprint every owned file; never include mutable worlds in the swap. */
export function verifyPairedTree(root, key, { profile = PAIRED_RUNTIMES[key] } = {}) {
  if (!profile || fs.realpathSync(root) !== path.resolve(root) || !fs.lstatSync(root).isDirectory()) throw new Error("Paired runtime requires a real package directory");
  const rows = [], stack = [root]; let count = 0;
  while (stack.length) {
    const parent = stack.pop();
    for (const name of fs.readdirSync(parent)) {
      const filename = path.join(parent, name), info = fs.lstatSync(filename), relative = path.relative(root, filename).split(path.sep).join("/");
      // The native Trackmania engine writes beside its executable. These exact
      // bindings keep private configuration, maps and logs outside binary swaps.
      if (key === "trackmania" && parent === root && ["UserData", "Logs", "CommonData"].includes(name) && info.isSymbolicLink()) {
        const target = path.resolve(root, "..", name), targetInfo = fs.lstatSync(target);
        if (fs.readlinkSync(filename) !== "../" + name || !targetInfo.isDirectory() || targetInfo.isSymbolicLink() || fs.realpathSync(filename) !== target) throw new Error("Trackmania mutable-data binding is unsafe");
        continue;
      }
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
    for (const row of rows) { hash.update(row.relative + "\0" + fileSha(row.filename) + "\n"); totalBytes += row.info.size; }
    tree = { fingerprint, treeSha256: hash.digest("hex"), fileCount: rows.length, totalBytes };
    if (cache.size >= 16) cache.clear(); cache.set(root, tree);
  }
  const release = profile.versions.find(version => version.treeSha256 === tree.treeSha256 && version.fileCount === tree.fileCount && version.totalBytes === tree.totalBytes);
  if (!release) throw new Error("Paired runtime engine and assets do not match a reviewed package");
  if (key === "space-station-14") verifySpaceStation14Metadata(root, release);
  for (const binary of (release.binaries || profile.binaries)) {
    if (!safeRelative(binary)) throw new Error("Paired runtime binary path is invalid");
    const filename = path.join(root, binary);
    if (profile.executableFormat === "pe32") {
      const fd=fs.openSync(filename,"r"),dos=Buffer.alloc(64),pe=Buffer.alloc(26);
      try {
        if(fs.readSync(fd,dos,0,64,0)!==64||dos.readUInt16LE(0)!==0x5a4d)throw new Error("Paired runtime requires a reviewed PE engine");
        const offset=dos.readUInt32LE(60);
        if(offset<64||offset>1024*1024||fs.readSync(fd,pe,0,26,offset)!==26||pe.readUInt32LE(0)!==0x4550||pe.readUInt16LE(4)!==0x14c||pe.readUInt16LE(24)!==0x10b)throw new Error("Paired runtime requires a reviewed PE32 engine");
      }finally{fs.closeSync(fd);}
      continue;
    }
    fs.accessSync(filename, fs.constants.X_OK);
    const fd = fs.openSync(filename, "r"), header = Buffer.alloc(20);
    try {
      const elfClass = profile.elfClass ?? 2;
      if (![1, 2].includes(elfClass) || fs.readSync(fd, header, 0, 20, 0) !== 20 || header.readUInt32BE(0) !== 0x7f454c46 || header[4] !== elfClass || header[5] !== 1 || header.readUInt16LE(18) !== (elfClass === 1 ? 3 : 62)) throw new Error("Paired runtime needs a reviewed ELF engine architecture");
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

const PAIRED_RECORD = ".pb-paired-verified.json";
const fileIdentity = info => [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs, info.mode];

/** Inventory records never replace full verification before starts/activation. */
export function recordPairedVerification(root, key, verified, { profile = PAIRED_RUNTIMES[key] } = {}) {
  if (!profile || fs.realpathSync(root) !== path.resolve(root)) throw new Error("Paired runtime verification root requires review");
  const release = profile.versions.find(row => row.buildId === verified.buildId), runtime = path.join(root, "runtime");
  if (!release || fs.realpathSync(runtime) !== path.resolve(runtime)) throw new Error("Paired runtime verification requires a reviewed release");
  const binaries = Object.fromEntries((release.binaries || profile.binaries).map(name => [name, fileIdentity(fs.lstatSync(path.join(runtime, name)))]));
  const info = fs.statSync(runtime), temporary = path.join(root, ".paired-verification-" + randomUUID());
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, buildId: release.buildId, treeSha256: release.treeSha256, device: info.dev, inode: info.ino, binaries }), { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, path.join(root, PAIRED_RECORD));
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export function inspectPairedInstallation(root, key, { profile = PAIRED_RUNTIMES[key] } = {}) {
  const runtime = path.join(root, "runtime"), file = path.join(root, PAIRED_RECORD);
  if (!profile || fs.realpathSync(root) !== path.resolve(root) || fs.realpathSync(runtime) !== path.resolve(runtime)) throw new Error("Paired runtime installation requires review");
  const marker = fs.lstatSync(file);
  if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1 || marker.size > 16384) throw new Error("Paired runtime full verification record is unavailable");
  const recorded = JSON.parse(fs.readFileSync(file, "utf8")), info = fs.statSync(runtime);
  const release = profile.versions.find(row => row.buildId === recorded.buildId && row.treeSha256 === recorded.treeSha256);
  if (recorded.version !== 1 || !release || info.dev !== recorded.device || info.ino !== recorded.inode) throw new Error("Paired runtime changed and needs full verification");
  for (const name of (release.binaries || profile.binaries)) {
    const binary = path.join(runtime, name), current = fs.lstatSync(binary);
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || fs.realpathSync(binary) !== path.resolve(binary) || JSON.stringify(fileIdentity(current)) !== JSON.stringify(recorded.binaries?.[name])) throw new Error("Paired runtime engine changed and needs full verification");
  }
  return { buildId: release.buildId };
}

/** One-time enrollment copies immutable legacy files; it never moves worlds. */
export function enrollPairedRuntime(root, key, { profile = PAIRED_RUNTIMES[key] } = {}) {
  if (!PAIRED_RUNTIMES[key] || !profile || fs.realpathSync(root) !== path.resolve(root)) throw new Error("Paired runtime enrollment requires a supported real installation");
  if (fs.existsSync(path.join(root, "runtime"))) return verifyPairedInstallation(root, key, { profile });
  const lock = path.join(root, ".pb-runtime-enroll.lock"), fd = fs.openSync(lock, "wx", 0o600);
  const fresh = path.join(root, ".pb-runtime-" + randomUUID());
  try {
    fs.mkdirSync(fresh, { mode: 0o700 });
    const legacy = key === "warzone-2100"
      ? [["warzone2100", "/usr/bin/warzone2100"], ["crashpad_handler_warzone2100", "/usr/bin/crashpad_handler_warzone2100"], ["data", "/usr/share/warzone2100"]]
      : (key === "space-station-14" ? profile.legacyRoots : key === "bombsquad" ? ["bombsquad_server", "dist"] : key === "trackmania" ? ["TrackmaniaServer", "Packs"] : key === "freeciv" ? ["bin", "lib", "share"] : ["veloren-server-cli", "assets"]).map(name => [name, path.join(root, name)]);
    for (const [name, original] of legacy) {
      if (!safeRelative(name)) throw new Error("Paired runtime legacy root is invalid");
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

const HOSTS = new Set(["files.ballistica.net", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "nadeo-download.cdn.ubi.com", "wizards.cdn.spacestation14.com"]);
function trusted(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password) throw new Error("Paired runtime redirect is untrusted");
  return url.href;
}
export async function stagePairedRuntime(stage, key, { run, request = httpsGetStream, diskCheck = () => {}, profile = PAIRED_RUNTIMES[key], verify = verifyPairedInstallation } = {}) {
  if (!profile || !new RegExp(`^\\.pb-update-${key}-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$`).test(path.basename(stage))) throw new Error("Paired runtime requires an isolated staging directory");
  verify(stage, key);
  const release = profile.versions.find(row => row.buildId === profile.latest);
  if (key === "freeciv" && release?.format === "reviewed-source") {
    const fresh = stage + "-source", previous = path.join(stage, ".paired-previous");
    try {
      await run("/usr/bin/python3", [fileURLToPath(new URL("./reviewedHostedSourceBuild.py", import.meta.url)), "freeciv", fresh], { timeout: 35 * 60_000, maxOutput: 8192, root: path.dirname(stage) });
      const output = path.join(fresh, "publish/runtime");
      if (verifyPairedTree(output, key, { profile }).buildId !== profile.latest) throw new Error("Freeciv compiled engine/libraries/data differ from review");
      if (fs.existsSync(previous)) throw new Error("Freeciv staging needs inspection");
      fs.renameSync(path.join(stage, "runtime"), previous);
      try { fs.renameSync(output, path.join(stage, "runtime")); }
      catch(error) { fs.renameSync(previous,path.join(stage,"runtime")); throw error; }
      fs.rmSync(previous, {recursive:true});
      return verify(stage,key);
    } finally { if (fs.existsSync(fresh)) fs.rmSync(fresh,{recursive:true}); }
  }
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
