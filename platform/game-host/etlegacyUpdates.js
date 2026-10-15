import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { httpsGetStream } from "./downloadStream.js";

export const ETLEGACY_RELEASES = JSON.parse(fs.readFileSync(new URL("./etlegacyReleases.json", import.meta.url), "utf8"));
const MANAGED_FILES = fs.readFileSync(new URL("./etlegacyManagedFiles.txt", import.meta.url), "utf8").trim().split("\n");
const cache = new Map();
const fingerprint = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs, s.mode].join(":");
export function etlegacyInventory(root, managed) {
  const files = [], stack = managed ? [...managed] : ["legacy", "licenses", "etlded.x86_64"];
  let entries = 0, total = 0;
  while (stack.length) {
    const relative = stack.pop(), filename = path.join(root, relative), stat = fs.lstatSync(filename);
    if (fs.realpathSync(filename) !== filename) throw new Error("ET Legacy managed paths must not traverse links");
    if (++entries > 6000 || stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error("ET Legacy package contains unexpected files or links");
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(filename)) stack.push(`${relative}/${name}`);
    } else {
      if (stat.nlink !== 1 || stat.size > 128 * 1024 ** 2 || (total += stat.size) > 256 * 1024 ** 2) throw new Error("ET Legacy package exceeds reviewed bounds");
      files.push({ relative, filename, size: stat.size, fingerprint: fingerprint(stat) });
    }
  }
  return files.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
}
export function etlegacyTreeDigest(files) {
  const tree = createHash("sha256");
  for (const file of files) {
    const hash = createHash("sha256"), fd = fs.openSync(file.filename, "r"), buffer = Buffer.allocUnsafe(64 * 1024);
    try { let bytes; while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, bytes)); }
    finally { fs.closeSync(fd); }
    tree.update(`${file.relative}\0${file.size}\0${hash.digest("hex")}\n`);
  }
  return tree.digest("hex");
}
export function verifyEtlegacyInstallation(root, { profiles = ETLEGACY_RELEASES.versions, command = execFileSync } = {}) {
  if (!fs.lstatSync(root).isDirectory() || fs.realpathSync(root) !== path.resolve(root)) throw new Error("ET Legacy installation must be a real directory");
  if (fs.existsSync(path.join(root, "run-server"))) throw new Error("ET Legacy custom launcher requires review");
  const alias = path.join(root, "etlded");
  if (fs.existsSync(alias) && (!fs.lstatSync(alias).isSymbolicLink() || fs.realpathSync(alias) !== path.join(root, "etlded.x86_64"))) throw new Error("ET Legacy launcher must use the reviewed dedicated engine");
  const versions = Object.keys(profiles);
  const versionedPaks = fs.readdirSync(path.join(root, "legacy")).filter((name) => /^legacy_v\d+\.\d+\.\d+\.pk3$/.test(name));
  if (profiles === ETLEGACY_RELEASES.versions && (versionedPaks.length !== 1 || !versions.some((v) => versionedPaks[0] === `legacy_v${v}.pk3`))) throw new Error("ET Legacy mixed or unknown server mod versions require review");
  const candidate = versions.find((v) => versionedPaks[0] === `legacy_v${v}.pk3`);
  const files = etlegacyInventory(root, profiles === ETLEGACY_RELEASES.versions ? MANAGED_FILES.map((name) => name.replace("{version}", candidate)) : undefined);
  const key = createHash("sha256").update(files.map((row) => `${row.relative}:${row.fingerprint}`).join("|")
    + (process.platform === "linux" ? fingerprint(fs.statSync("/etc/ld.so.cache")) : "fixture")).digest("hex");
  if (profiles === ETLEGACY_RELEASES.versions && command === execFileSync && cache.has(key)) return { ...cache.get(key) };
  const digest = etlegacyTreeDigest(files);
  const version = Object.entries(profiles).find(([v, profile]) => (!candidate || v === candidate) && profile.fileCount === files.length && profile.treeSha256 === digest)?.[0];
  if (!version) throw new Error("ET Legacy engine/mod/bot package differs from the reviewed release; custom changes require review");
  for (const binary of ["etlded.x86_64", "legacy/qagame.mp.x86_64.so", "legacy/tvgame.mp.x86_64.so", "legacy/omni-bot/omnibot_et.x86_64.so"]) {
    const file = path.join(root, binary), fd = fs.openSync(file, "r"), header = Buffer.alloc(20);
    try { fs.readSync(fd, header); } finally { fs.closeSync(fd); }
    if (header.subarray(0, 4).toString("hex") !== "7f454c46" || header[4] !== 2 || header.readUInt16LE(18) !== 62) throw new Error("ET Legacy requires x86-64 native binaries");
    const dependencies = command("/usr/bin/ldd", [file], { timeout: 15_000, maxBuffer: 65536, env: { PATH: "/usr/bin:/bin", LANG: "C" }, stdio: ["ignore", "pipe", "pipe"] }).toString();
    if (/not found/.test(dependencies)) throw new Error("ET Legacy runtime libraries are missing");
  }
  fs.accessSync(path.join(root, "etlded.x86_64"), fs.constants.X_OK);
  const result = { buildId: version };
  if (profiles === ETLEGACY_RELEASES.versions && command === execFileSync) { if (cache.size > 32) cache.clear(); cache.set(key, result); }
  return result;
}

export async function stageEtlegacyRelease(stage, { run, request = httpsGetStream, diskCheck = () => {}, verify = verifyEtlegacyInstallation } = {}) {
  if (!/^\.pb-update-wolfenstein-enemy-territory-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("ET Legacy requires an isolated staging directory");
  const original = verify(stage);
  const profile = ETLEGACY_RELEASES.versions[ETLEGACY_RELEASES.latest];
  const archive = path.join(stage, ".pb-etlegacy-download"), fresh = path.join(stage, ".pb-etlegacy-new");
  let response;
  try {
    response = await request(ETLEGACY_RELEASES.url, { maxRedirects: 0, signal: AbortSignal.timeout(5 * 60_000) });
    if (response.statusCode !== 200 || !response.stream) throw new Error("ET Legacy official package is unavailable");
    const fd = fs.openSync(archive, "wx", 0o600), hash = createHash("sha256"); let size = 0;
    try {
      for await (const chunk of response.stream) {
        if ((size += chunk.length) > profile.archiveBytes) throw new Error("ET Legacy package exceeds its reviewed size");
        diskCheck(); hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) {
          const written = fs.writeSync(fd, chunk, offset, chunk.length - offset);
          if (!written) throw new Error("ET Legacy package write failed");
          offset += written;
        }
      }
      if (size !== profile.archiveBytes || hash.digest("hex") !== profile.archiveSha256) throw new Error("ET Legacy package failed SHA-256 verification");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    await run("/usr/bin/python3", [fileURLToPath(new URL("./etlegacyArchive.py", import.meta.url)), archive, fresh], { timeout: 120_000, maxOutput: 4096 });
    verify(fresh);
    // Replace exactly publisher-owned files. Omni-bot generates user configs
    // inside this tree; they are deliberately outside the owned manifest.
    const oldFiles = new Set(MANAGED_FILES.map((name) => name.replace("{version}", original.buildId)));
    const newFiles = MANAGED_FILES.map((name) => name.replace("{version}", ETLEGACY_RELEASES.latest));
    for (const name of newFiles) {
      const target = path.join(stage, name);
      if (fs.existsSync(target) && !oldFiles.has(name)) throw new Error("ET Legacy new package conflicts with an unmanaged file");
      let parent = stage;
      for (const part of name.split("/").slice(0, -1)) {
        parent = path.join(parent, part);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent);
        if (!fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink()) throw new Error("ET Legacy managed parent must be a directory");
      }
      fs.renameSync(path.join(fresh, name), target);
    }
    const next = new Set(newFiles);
    for (const name of oldFiles) if (!next.has(name)) fs.unlinkSync(path.join(stage, name));
    return verify(stage);
  } finally {
    response?.stream?.destroy?.();
    if (fs.existsSync(archive)) fs.unlinkSync(archive);
    if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true });
  }
}
