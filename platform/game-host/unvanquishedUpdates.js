import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { httpsGetStream } from "./downloadStream.js";

export const UNVANQUISHED_RELEASES = JSON.parse(fs.readFileSync(new URL("./unvanquishedReleases.json", import.meta.url), "utf8"));
const cache = new Map();
const fingerprint = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs, s.mode].join(":");
function digest(filename) {
  const hash = createHash("sha256"), fd = fs.openSync(filename, "r"), buffer = Buffer.allocUnsafe(64 * 1024);
  try { let length; while ((length = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length)); }
  finally { fs.closeSync(fd); }
  return hash.digest("hex");
}
export function verifyUnvanquishedInstallation(root, { profiles = UNVANQUISHED_RELEASES.versions, command = execFileSync } = {}) {
  if (!fs.lstatSync(root).isDirectory() || fs.realpathSync(root) !== path.resolve(root)) throw new Error("Unvanquished requires a real installation directory");
  if (fs.existsSync(path.join(root, "run-server"))) throw new Error("Unvanquished custom launchers require review");
  const packages = fs.readdirSync(path.join(root, "pkg")).filter((name) => /^unvanquished_.*\.dpk$/.test(name));
  const version = Object.keys(profiles).find((v) => packages.length === 1 && packages[0] === `unvanquished_${v}.dpk`);
  if (!version) throw new Error("Unvanquished mixed or unreviewed game modules require compatibility review");
  const profile = profiles[version];
  const entries = Object.entries(profile.files).map(([name, expected]) => {
    if (!/^(?:pkg\/)?[a-zA-Z0-9_.-]+$/.test(name)) throw new Error("Unvanquished managed filename is invalid");
    const filename = path.join(root, name), info = fs.lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || fs.realpathSync(filename) !== filename || info.size !== expected.bytes) throw new Error("Unvanquished files differ from the reviewed package");
    if (expected.executable) fs.accessSync(filename, fs.constants.X_OK);
    return { filename, info, expected };
  });
  const key = root + entries.map((row) => fingerprint(row.info)).join("|")
    + (process.platform === "linux" ? fingerprint(fs.statSync("/etc/ld.so.cache")) : "fixture");
  if (profiles === UNVANQUISHED_RELEASES.versions && command === execFileSync && cache.has(key)) return { ...cache.get(key) };
  for (const row of entries) if (digest(row.filename) !== row.expected.sha256) throw new Error("Unvanquished files differ from the reviewed package");
  for (const name of ["daemonded", "nacl_loader"]) {
    const filename = path.join(root, name), fd = fs.openSync(filename, "r"), header = Buffer.alloc(20);
    try { fs.readSync(fd, header); } finally { fs.closeSync(fd); }
    if (header.subarray(0, 4).toString("hex") !== "7f454c46" || header[4] !== 2 || header.readUInt16LE(18) !== 62) throw new Error("Unvanquished requires x86-64 server binaries");
    const output = command("/usr/bin/ldd", [filename], { timeout: 15000, maxBuffer: 65536, env: { PATH: "/usr/bin:/bin", LANG: "C" }, stdio: ["ignore", "pipe", "pipe"] }).toString();
    if (/not found/.test(output)) throw new Error("Unvanquished native dependencies are missing");
  }
  const result = { buildId: version };
  if (profiles === UNVANQUISHED_RELEASES.versions && command === execFileSync) { if (cache.size > 32) cache.clear(); cache.set(key, result); }
  return result;
}

// Recipe searches this older global location before the installation packages.
// An external override could silently run the wrong game module after update.
export function validateUnvanquishedOverrides(home) {
  if (!home) throw new Error("Unvanquished host home is unavailable");
  const directory = path.join(home, ".local/share/unvanquished/pkg");
  if (fs.existsSync(directory) && fs.readdirSync(directory).some((name) => name.endsWith(".dpk") || name.endsWith(".dpkdir"))) throw new Error("Unvanquished global package overrides require operator review before updates");
}

async function officialStream(version, request, signal) {
  let url = `https://github.com/Unvanquished/Unvanquished/releases/download/v${version}/unvanquished_${version}.zip`;
  for (let hop = 0; hop < 5; hop++) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(parsed.hostname)) throw new Error("Unvanquished download redirect is untrusted");
    const response = await request(url, { maxRedirects: 0, followRedirects: false, signal });
    if (![301, 302, 303, 307, 308].includes(response.statusCode)) return response;
    response.stream?.destroy();
    if (!response.headers?.location) throw new Error("Unvanquished release redirect is missing");
    url = new URL(response.headers.location, url).href;
  }
  throw new Error("Unvanquished release redirect limit exceeded");
}

export async function stageUnvanquishedRelease(stage, { run, request = httpsGetStream, diskCheck = () => {}, verify = verifyUnvanquishedInstallation } = {}) {
  if (!/^\.pb-update-unvanquished-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("Unvanquished requires an isolated staging directory");
  const original = verify(stage), version = UNVANQUISHED_RELEASES.latest, profile = UNVANQUISHED_RELEASES.versions[version];
  const archive = path.join(stage, ".pb-unvanquished-download"), fresh = path.join(stage, ".pb-unvanquished-new");
  let response;
  try {
    response = await officialStream(version, request, AbortSignal.timeout(10 * 60_000));
    if (response.statusCode !== 200 || !response.stream) throw new Error("Unvanquished official download is unavailable");
    const fd = fs.openSync(archive, "wx", 0o600), hash = createHash("sha256"); let size = 0;
    try {
      for await (const chunk of response.stream) {
        if ((size += chunk.length) > profile.archiveBytes) throw new Error("Unvanquished download exceeds the reviewed size");
        diskCheck(); hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) { const written = fs.writeSync(fd, chunk, offset, chunk.length - offset); if (!written) throw new Error("Unvanquished download write failed"); offset += written; }
      }
      if (size !== profile.archiveBytes || hash.digest("hex") !== profile.archiveSha256) throw new Error("Unvanquished download failed SHA-256 verification");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    await run("/usr/bin/python3", [fileURLToPath(new URL("./unvanquishedArchive.py", import.meta.url)), archive, fresh], { timeout: 180_000, maxOutput: 4096 });
    verify(fresh);
    const oldFiles = new Set(Object.keys(UNVANQUISHED_RELEASES.versions[original.buildId].files));
    for (const name of Object.keys(profile.files)) {
      const target = path.join(stage, name);
      if (fs.existsSync(target) && !oldFiles.has(name)) throw new Error("Unvanquished new package conflicts with an unmanaged file");
      fs.renameSync(path.join(fresh, name), target);
    }
    for (const name of oldFiles) if (!Object.hasOwn(profile.files, name)) fs.unlinkSync(path.join(stage, name));
    return verify(stage);
  } finally {
    response?.stream?.destroy?.();
    if (fs.existsSync(archive)) fs.unlinkSync(archive);
    if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true });
  }
}
