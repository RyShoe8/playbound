import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MARKER = ".pb-factorio-release.json";
const VERSION = /^\d+\.\d+\.\d+$/;
const LIMIT = 256 * 1024 ** 2;
const HOSTS = new Set(["factorio.com", "www.factorio.com", "dl.factorio.com", "dcdn.factorio.com"]);
const cache = new Map();
const hash = value => createHash("sha256").update(value).digest("hex");

async function officialResponse(url, request, signal) {
  for (let redirects = 0; redirects <= 4; redirects++) {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:" || !HOSTS.has(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.port) throw new Error("Factorio download redirect is not trusted");
    const response = await request(endpoint.href, { redirect: "manual", signal, headers: { "User-Agent": "PlayBound-game-host" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.ok || !response.body) throw new Error("Factorio official download failed");
      return response;
    }
    const next = response.headers.get("location"); await response.body?.cancel();
    if (!next || redirects === 4) throw new Error("Factorio redirect limit exceeded");
    url = new URL(next, endpoint).href;
  }
}
async function text(url, request, signal) {
  const response = await officialResponse(url, request, signal), chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 1024 ** 2) throw new Error("Factorio metadata exceeds its size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function inventory(root) {
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error("Factorio requires a real installation directory");
  const files = Object.create(null), fingerprint = [];
  let count = 0, total = 0;
  function walk(directory, relative = "", depth = 0) {
    if (depth > 32) throw new Error("Factorio installation is too deeply nested");
    for (const name of fs.readdirSync(directory).sort()) {
      if (++count > 30000) throw new Error("Factorio installation inventory exceeds its limit");
      if (!relative && name === MARKER) continue;
      if (name.startsWith(".") || /[\\:\x00-\x1f\x7f]/.test(name)) throw new Error("Factorio custom files require review");
      const filename = path.join(directory, name), key = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(filename);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) || stat.mode & 0o7000 || (stat.isFile() && stat.nlink !== 1)) throw new Error("Factorio links and special files require review");
      if (stat.isDirectory()) walk(filename, key, depth + 1);
      else {
        total += stat.size;
        if (stat.size > LIMIT || total > 2 * 1024 ** 3) throw new Error("Factorio installation exceeds its size limit");
        files[key] = { size: stat.size, filename };
        fingerprint.push([key, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode]);
      }
    }
  }
  walk(root);
  return { files, fingerprint: JSON.stringify(fingerprint) };
}
function manifestFor(root, buildId) {
  if (!VERSION.test(buildId || "")) throw new Error("Invalid Factorio version");
  const { files } = inventory(root);
  if (!files["bin/x64/factorio"] || !files["data/base/info.json"]) throw new Error("Factorio headless package is incomplete");
  const entries = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { size: file.size, sha256: hash(fs.readFileSync(file.filename)) }]));
  return { version: 1, buildId, files: entries };
}
export function verifyFactorioInstallation(root, { command = execFileSync } = {}) {
  const marker = path.join(root, MARKER), stat = fs.lstatSync(marker);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 8 * 1024 ** 2) throw new Error("Factorio requires a verified official-package baseline");
  const record = JSON.parse(fs.readFileSync(marker, "utf8"));
  if (record.version !== 1 || !VERSION.test(record.buildId || "") || !record.files || Array.isArray(record.files)) throw new Error("Invalid Factorio release record");
  const current = inventory(root), keys = Object.keys(current.files);
  if (keys.sort().join("\n") !== Object.keys(record.files).sort().join("\n")) throw new Error("Factorio custom or missing installation files require review");
  const identity = hash(JSON.stringify(record)) + current.fingerprint;
  if (command === execFileSync && cache.get(root) === identity) return { buildId: record.buildId };
  for (const [key, file] of Object.entries(current.files)) {
    const expected = record.files[key];
    if (expected.size !== file.size || !/^[a-f0-9]{64}$/.test(expected.sha256 || "") || hash(fs.readFileSync(file.filename)) !== expected.sha256) throw new Error("Factorio installation differs from its verified package");
  }
  const binary = path.join(root, "bin/x64/factorio"), header = fs.readFileSync(binary).subarray(0, 20);
  if (header.length < 20 || header.readUInt32BE(0) !== 0x7f454c46 || header[4] !== 2 || header[5] !== 1 || header.readUInt16LE(18) !== 62) throw new Error("Factorio requires an x86_64 Linux headless executable");
  fs.accessSync(binary, fs.constants.X_OK);
  const info = JSON.parse(fs.readFileSync(path.join(root, "data/base/info.json"), "utf8"));
  if (info.version !== record.buildId) throw new Error("Factorio base data version differs from its executable release");
  const output = command(binary, ["--version"], { timeout: 15000, maxBuffer: 8192, cwd: "/tmp", env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", LANG: "C" }, stdio: ["ignore", "pipe", "pipe"] }).toString();
  if (!output.includes(`Version: ${record.buildId} (`) || !/linux64, headless/.test(output)) throw new Error("Factorio headless version or runtime validation failed");
  if (command === execFileSync) { if (cache.size >= 16) cache.clear(); cache.set(root, identity); }
  return { buildId: record.buildId };
}

/** Offline operator baseline: the reference must already be checksum verified.
 * Existing custom files or newer/different data are never silently overwritten. */
export function baselineFactorioInstallation(root, reference) {
  const verified = verifyFactorioInstallation(reference), expected = manifestFor(reference, verified.buildId), actual = manifestFor(root, verified.buildId);
  if (JSON.stringify(actual.files) !== JSON.stringify(expected.files)) throw new Error("Existing Factorio installation differs from the official package; operator review required");
  fs.writeFileSync(path.join(root, MARKER), JSON.stringify(expected), { flag: "wx", mode: 0o600 });
  return verifyFactorioInstallation(root);
}

/** Download only the stable headless channel. No caller URL, version or secrets. */
export async function prepareFactorioRelease(destination, { run, request = fetch, diskCheck = () => {}, verify = verifyFactorioInstallation }) {
  const signal = AbortSignal.timeout(5 * 60_000);
  const version = JSON.parse(await text("https://factorio.com/api/latest-releases", request, signal)).stable?.headless;
  if (!VERSION.test(version || "")) throw new Error("Factorio stable headless version is invalid");
  const name = `factorio-headless_linux_${version}.tar.xz`;
  const sums = await text("https://factorio.com/download/sha256sums/", request, signal);
  const matches = sums.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(row => row[1] === name);
  if (matches.length !== 1 || !/^[a-f0-9]{64}$/.test(matches[0][0])) throw new Error("Factorio release has no unique official SHA-256 checksum");
  const archive = `${destination}.tar.xz`;
  const response = await officialResponse(`https://factorio.com/get-download/${version}/headless/linux64`, request, signal);
  const fd = fs.openSync(archive, "wx", 0o600), checksum = createHash("sha256"); let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > LIMIT) throw new Error("Factorio package exceeds its download limit");
      diskCheck(); checksum.update(chunk);
      let offset = 0;
      while (offset < chunk.length) { const written = fs.writeSync(fd, chunk, offset, chunk.length - offset); if (!written) throw new Error("Factorio download write failed"); offset += written; }
    }
    if (!size || checksum.digest("hex") !== matches[0][0]) throw new Error("Factorio package failed its official SHA-256 check");
    fs.fsyncSync(fd);
  } catch (error) { fs.closeSync(fd); fs.unlinkSync(archive); throw error; }
  fs.closeSync(fd);
  try {
    await run("/usr/bin/python3", [fileURLToPath(new URL("./factorioArchive.py", import.meta.url)), archive, destination], { timeout: 120000, maxOutput: 8192 });
    fs.writeFileSync(path.join(destination, MARKER), JSON.stringify(manifestFor(destination, version)), { flag: "wx", mode: 0o600 });
    return verify(destination);
  } finally { fs.unlinkSync(archive); }
}
export async function stageFactorioRelease(stage, { verify = verifyFactorioInstallation, ...options }) {
  if (!/^\.pb-update-factorio-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("Factorio updates require an isolated worker directory");
  const previous = verify(stage);
  const fresh = `${stage}-official`;
  try {
    const next = await prepareFactorioRelease(fresh, { ...options, verify });
    if (next.buildId.split(".")[0] !== previous.buildId.split(".")[0]) throw new Error("Factorio major-version changes require world compatibility review");
    const compare = (a, b) => { for (let i = 0; i < 3; i++) { const difference = Number(a.split(".")[i]) - Number(b.split(".")[i]); if (difference) return difference; } return 0; };
    if (compare(next.buildId, previous.buildId) < 0) throw new Error("Factorio stable channel would downgrade this installation");
    fs.rmSync(stage, { recursive: true });
    fs.renameSync(fresh, stage);
    return verify(stage);
  } finally { if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true }); }
}
